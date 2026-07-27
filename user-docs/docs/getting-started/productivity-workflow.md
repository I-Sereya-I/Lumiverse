# Productivity Workflow

Lumiverse's productivity surfaces put frequent navigation, connection, lore,
portrait, character, and lorebook actions closer to the work you are doing.
Their settings are saved to your Lumiverse account and normally survive reloads
and restarts.

!!! note "Feature availability"
    The productivity overhaul is delivered as host UI. On an in-progress build,
    a saved setting may exist before its matching control or surface is
    available.

## Quick Toolbar

The Quick Toolbar opens the same panels and actions as the main drawer.

- **Free toolbar (V1)** can move, resize, change orientation, snap to an edge,
  and adjust icons, labels, scale, rotation, and opacity.
- **Settings-adjacent toolbar (V2)** stays beside the host controls. You can
  adjust its icon and label sizes, but it does not float freely.
- **Adaptive toolbar (V3)** supports horizontal or vertical presentation and
  remembers its free placement.

You can enable or disable actions and reorder them. The full drawer remains
available even when the toolbar is enabled.

## Connections Picker

Use the small composer launcher to switch connection profiles and the main
chat model without opening the full Connection manager.

The three layouts are:

- **Provider tags** for filtering profiles with your own colored tags.
- **Split** for side-by-side profile and model lists.
- **Full** for favorites, recent profiles, all profiles, and model sections.

Search matches profile name, provider, model, and profile tag. You can remember
picker size, density, thumbnail size, section spacing, visible sections, and
column widths. Selected tag filters, favorite profiles, and recent profile
ordering are also remembered. Profile tags organize connection profiles; they
do not describe model capabilities.

## Lore Indicator

After a generation, the Lore Indicator summarizes activated world-book
entries:

- **Compact (V2)** opens details by click or hover.
- **Bottom strip (V4)** shows reorderable count, token, pass, Constant,
  Keyword, and Vector items. Each item can be hidden, removed, or switched
  between icon-only and icon-plus-text.
- **Command palette (V5)** opens a searchable lore list with its configured
  shortcut. The default is **Ctrl+Shift+L**.

You can change visible metadata, icon/text sizes, spacing, and the color/icon
used for each activation type. Clicking an entry uses the existing lorebook
editor navigation when exact entry linking is available.

## Portrait Dock

Clicking a supported character portrait opens an image-focused dock. It starts
at the image's natural size when the viewport permits and otherwise fits the
available space.

On desktop, a left or right dock reserves room for chat and the composer. A
floating dock can move and resize independently. On narrow screens, the
portrait uses drawer/backdrop behavior instead of reserving desktop width.

Saved options include open/closed state, the last portrait, dock side, size and
position, edge snapping, pin state, current and default aspect-ratio lock,
natural-size opening, resize limits, and hover-control size.

## Homepage Character Library

The home page can show a character grid with a selected-character preview.
Cards support independent thumbnail width and height, density, footer size,
visible metadata, tag rows, view mode, default sorting, and default filtering.
The preview remembers its width, pinned state, and last selected character.

The homepage loads lightweight summaries and only fetches expanded data for
the selected character. The **Edit** action opens the complete Character
editor. Character cards do not show date text or internal ownership values.

## Character Tab

The Character tab keeps its existing management workflow: search, tags,
favorites, sorting, pagination, import, create, edit, duplicate, and delete.

It can share the homepage card settings or use separate overrides. When
separate settings are enabled, the same thumbnail, density, footer, metadata,
tag-row, view, sort, and filter controls apply only to the Character tab.

## Lorebook Editor

The full editor and half-screen editor share the same lorebook data.

- Choose **words** or **icons** for trigger types.
- Enable or hide the half-screen launch button.
- Allow launch from the Lore Indicator.
- Allow or prevent simultaneous full and half editors.
- Resize the lorebook, entry, and inspector panes.
- Choose row density and visible entry metadata.

Token estimates update automatically after entry content changes. When
simultaneous editing protection is available, a stale save reports a conflict
instead of silently overwriting newer content.

## Resetting A Surface

Open the Productivity/Layout settings and reset only the affected section.
After resetting, reload Lumiverse.

For a surface that is merely off-screen, reset its position/size rather than
all of its preferences. See
[Troubleshooting](../reference/troubleshooting.md#productivity-surface-issues)
for symptom-specific recovery.

## Workflow Tips

1. Put your most-used drawer actions in the Quick Toolbar.
2. Tag connection profiles by task, then switch profile/model from the
   composer.
3. Use the compact Lore Indicator during normal chat and the palette when
   searching many activations.
4. Pin the portrait or character preview only when you want it to remain open.
5. Use the half-screen lorebook editor when the chat context must stay visible.
