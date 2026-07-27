import ts from "typescript";
import path from "path";
import { Glob } from "bun";
import {
  componentKeyFromPath,
  isComponentExportName,
  isExcludedPath,
  propsAliasForBasename,
} from "../src/lib/componentRegistryJoin";

// A script to extract props AND module css for components
console.time("Total Extraction Time");

// Glob the whole of src/, not just src/components/ — `cssModuleRegistry.ts`
// enumerates `/src/**/*.module.css`, so narrowing here (as this used to) left
// top-level entries such as `App.module.css` listed by the picker with no
// generated data behind them.
const glob = new Glob("src/**/*.tsx");
const componentFiles = Array.from(glob.scanSync({ cwd: process.cwd(), absolute: true }))
  .filter((file) => !isExcludedPath(file));

console.time("createProgram");
const program = ts.createProgram(componentFiles, {
  skipLibCheck: true,
  noEmit: true,
  target: ts.ScriptTarget.Latest,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
});
console.timeEnd("createProgram");

console.time("getTypeChecker");
const checker = program.getTypeChecker();
console.timeEnd("getTypeChecker");

const result: Record<string, any[]> = {};
const cssResult: Record<string, string> = {};
/** file basename → component-ish exports declared in it, for basename aliasing */
const exportsByBasename = new Map<string, string[]>();

function serializeType(type: ts.Type, depth = 0): any[] {
  if (depth > 1) return []; // prevent infinite recursion

  const props: any[] = [];
  const properties = type.getProperties();

  for (const prop of properties) {
    const propName = prop.getName();
    if (propName === 'children' || propName === 'className' || propName === 'style' || propName === 'key' || propName === 'ref') continue;

    const propType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration || prop.declarations![0]);
    let typeString = checker.typeToString(propType);
    
    // Get doc comments
    const docTags = prop.getDocumentationComment(checker);
    const description = docTags.map(tag => tag.text).join('\n').trim();

    const propDoc: any = {
      name: propName,
      type: typeString,
      description: description || 'No description',
    };

    // If it's an object with properties (but not a function or generic like React.ReactNode), extract children
    if ((propType.flags & ts.TypeFlags.Object) && typeString.includes('{') && !typeString.includes('=>')) {
      const childProps = serializeType(propType, depth + 1);
      if (childProps.length > 0) {
        propDoc.children = childProps;
      }
    }

    props.push(propDoc);
  }

  return props;
}

/**
 * Collect every stylesheet the Custom-CSS picker can list.
 *
 * Keyed by the *stylesheet file basename*, which is exactly the key
 * `cssModuleRegistry.ts` builds its entries from (and the value it puts inside
 * `[data-component="…"]`).  Keying this by exported component name — as this
 * script used to — orphaned every stylesheet whose file name is not also an
 * exported symbol: `FormComponents.module.css`, `OOCStyles.module.css`,
 * `PromptVariablesEditor.module.css` (exports `VariablesEditor`),
 * `MemoryCortexEditors.module.css`, `LorebookEditorLayout.module.css` (no .tsx
 * at all) and `App.module.css` (outside the old glob).
 */
console.time("CSS collection");
async function collectCss() {
  const cssGlob = new Glob("src/**/*.module.css");
  const cssFiles = Array.from(cssGlob.scanSync({ cwd: process.cwd(), absolute: true }));

  await Promise.all(cssFiles.map(async (cssPath) => {
    // The registry withholds these from the picker; shipping them would be
    // unreachable bytes in the bundle.
    if (isExcludedPath(cssPath)) return;
    const key = componentKeyFromPath(cssPath);
    if (key in cssResult) return; // first wins, mirrors the registry's dedupe
    cssResult[key] = await Bun.file(cssPath).text();
  }));
}
await collectCss();
console.timeEnd("CSS collection");

console.time("AST Traversal");
async function processAST() {
  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (!sourceFile.fileName.includes('/src/')) continue;
    if (isExcludedPath(sourceFile.fileName)) continue;

    ts.forEachChild(sourceFile, (node) => {
      const noteExport = (componentName: string) => {
        const basename = componentKeyFromPath(sourceFile.fileName);
        const list = exportsByBasename.get(basename);
        if (list) list.push(componentName);
        else exportsByBasename.set(basename, [componentName]);
      };

      // Look for exported functions or variable declarations (arrow functions)
      let isExported = false;
      if (node.modifiers) {
        isExported = node.modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      }

      // Support: export function MyComponent() ...
      if (isExported && ts.isFunctionDeclaration(node) && node.name) {
        const componentName = node.name.text;
        if (isComponentExportName(componentName)) {
          noteExport(componentName);
          const propsParam = node.parameters[0];
          if (propsParam) {
            const type = checker.getTypeAtLocation(propsParam);
            result[componentName] = serializeType(type);
          } else {
            result[componentName] = [];
          }
        }
      }

      // Support: export default function(...)
      if (ts.isFunctionDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) {
        if (!node.name) {
          // export default function(props) ...
          const filename = path.basename(sourceFile.fileName, path.extname(sourceFile.fileName));
          const componentName = filename;
          if (isComponentExportName(componentName)) {
            noteExport(componentName);
            const propsParam = node.parameters[0];
            if (propsParam) {
              const type = checker.getTypeAtLocation(propsParam);
              result[componentName] = serializeType(type);
            } else {
              result[componentName] = [];
            }
          }
        }
      }

      // Support: export const MyComponent = (props) => ...
      // Support: export const MyComponent = forwardRef((props, ref) => ...)
      if (isExported && ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach(decl => {
          if (ts.isIdentifier(decl.name) && decl.initializer) {
            const componentName = decl.name.text;
            if (isComponentExportName(componentName)) {
            noteExport(componentName);
              let propsParam: ts.ParameterDeclaration | undefined;

              if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
                propsParam = decl.initializer.parameters[0];
              } else if (ts.isCallExpression(decl.initializer)) {
                // forwardRef((props, ref) => ...) or memo(...)
                const arg = decl.initializer.arguments[0];
                if (arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))) {
                  propsParam = arg.parameters[0];
                }
              }

              if (propsParam) {
                const type = checker.getTypeAtLocation(propsParam);
                result[componentName] = serializeType(type);
              } else {
                result[componentName] = [];
              }
            }
          }
        });
      }

      // Support: export default memo(...) or export default forwardRef(...)
      if (ts.isExportAssignment(node) && !node.isExportEquals) {
        const expr = node.expression;
        const filename = path.basename(sourceFile.fileName, path.extname(sourceFile.fileName));
        const componentName = filename;
        
        if (isComponentExportName(componentName)) {
          noteExport(componentName);
          let propsParam: ts.ParameterDeclaration | undefined;

          if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
            propsParam = expr.parameters[0];
          } else if (ts.isCallExpression(expr)) {
            const arg = expr.arguments[0];
            if (arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))) {
              propsParam = arg.parameters[0];
            }
          }

          if (propsParam) {
            const type = checker.getTypeAtLocation(propsParam);
            result[componentName] = serializeType(type);
          } else {
            result[componentName] = [];
          }
        }
      }
    });
  }

  // Let a file's basename borrow its single exported component's props, so a
  // picker entry named after the FILE (PromptVariablesEditor) still documents
  // the props of the component inside it (VariablesEditor).
  for (const [basename, exportNames] of exportsByBasename) {
    if (basename in result) continue;
    const alias = propsAliasForBasename(basename, exportNames);
    if (alias && result[alias]) result[basename] = result[alias];
  }
}

await processAST();
console.timeEnd("AST Traversal");

console.time("Writing output files");
const outPath = path.join(process.cwd(), "src/lib/generatedComponentProps.ts");
await Bun.write(outPath, `// AUTO-GENERATED - DO NOT EDIT\nexport default ${JSON.stringify(result, null, 2)} as Record<string, any[]>;\n`);
console.log("Wrote", Object.keys(result).length, "components to", outPath);

const cssOutPath = path.join(process.cwd(), "src/lib/generatedComponentCss.ts");
await Bun.write(cssOutPath, `// AUTO-GENERATED - DO NOT EDIT\nexport default ${JSON.stringify(cssResult, null, 2)} as Record<string, string>;\n`);
console.log("Wrote CSS for", Object.keys(cssResult).length, "components to", cssOutPath);
console.timeEnd("Writing output files");

console.timeEnd("Total Extraction Time");
