import os
import sys
import json
import re

repo_root = r'G:\AI\All lumiverse repos\Lumiverse'

chunk1_files = [
    r"G:\AI\All lumiverse repos\Lumiverse\AGENTS.md",
    r"G:\AI\All lumiverse repos\Lumiverse\CODE_OF_CONDUCT.md",
    r"G:\AI\All lumiverse repos\Lumiverse\CONTRIBUTING.md",
    r"G:\AI\All lumiverse repos\Lumiverse\docker-compose.build.yml",
    r"G:\AI\All lumiverse repos\Lumiverse\docker-compose.yml",
    r"G:\AI\All lumiverse repos\Lumiverse\LICENSE.md",
    r"G:\AI\All lumiverse repos\Lumiverse\README.md",
    r"G:\AI\All lumiverse repos\Lumiverse\SECURITY.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\index.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\product-guidelines.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\product.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tech-stack.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\workflow.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\code_styleguides\typescript.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\lumihub_guest_nsfw_auth_fix_20260814\index.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\lumihub_guest_nsfw_auth_fix_20260814\plan.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\lumihub_guest_nsfw_auth_fix_20260814\spec.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_extensibility_ui_modernization_20260816\index.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_extensibility_ui_modernization_20260816\plan.md"
]

def sanitize_id(s):
    cleaned = re.sub(r'[^a-zA-Z0-9_]', '_', s).lower()
    cleaned = re.sub(r'_+', '_', cleaned).strip('_')
    return cleaned

def make_node(node_id, label, file_type, source_file, rationale=None, source_location=None):
    valid_types = ["code", "document", "paper", "image", "rationale", "concept"]
    if file_type not in valid_types:
        raise ValueError(f"Invalid file_type: {file_type}")
    node = {
        "id": sanitize_id(node_id),
        "label": label,
        "file_type": file_type,
        "source_file": source_file,
        "source_location": source_location,
        "source_url": None,
        "captured_at": None,
        "author": None,
        "contributor": None
    }
    if rationale is not None:
        node["rationale"] = rationale
    return node

def make_edge(source, target, relation, confidence, confidence_score, source_file, weight=1.0, source_location=None):
    valid_relations = [
        "implements", "references", "cites", "conceptually_related_to",
        "shares_data_with", "semantically_similar_to", "rationale_for"
    ]
    if relation not in valid_relations:
        raise ValueError(f"Invalid relation: {relation}")
    if confidence not in ["EXTRACTED", "INFERRED", "AMBIGUOUS"]:
        raise ValueError(f"Invalid confidence: {confidence}")
    return {
        "source": sanitize_id(source),
        "target": sanitize_id(target),
        "relation": relation,
        "confidence": confidence,
        "confidence_score": float(confidence_score),
        "source_file": source_file,
        "source_location": source_location,
        "weight": float(weight)
    }

def make_hyperedge(hid, label, nodes, relation, confidence, confidence_score, source_file):
    valid_relations = ["participate_in", "implement", "form"]
    if relation not in valid_relations:
        raise ValueError(f"Invalid hyperedge relation: {relation}")
    if confidence not in ["EXTRACTED", "INFERRED"]:
        raise ValueError(f"Invalid hyperedge confidence: {confidence}")
    return {
        "id": sanitize_id(hid),
        "label": label,
        "nodes": [sanitize_id(n) for n in nodes],
        "relation": relation,
        "confidence": confidence,
        "confidence_score": float(confidence_score),
        "source_file": source_file
    }

def build_chunk_01():
    nodes = []
    edges = []
    hyperedges = []

    # 1. AGENTS.md
    f_agents = r"G:\AI\All lumiverse repos\Lumiverse\AGENTS.md"
    n_agents_doc = make_node("agents_doc", "Lumiverse Project Guidance Document", "document", f_agents)
    n_agents_debug = make_node("agents_evidence_first_debugging", "Evidence-First Debugging Protocol", "concept", f_agents, rationale="Stop guessing after two failed fixes; measure computed geometry and trace ancestors to root contract.")
    n_agents_fe_comp = make_node("agents_frontend_completion", "Frontend Completion and Build Verification Gate", "concept", f_agents, rationale="Require passing targeted tests, typechecking, and production build with asset hash verification before manual testing.")
    nodes.extend([n_agents_doc, n_agents_debug, n_agents_fe_comp])
    edges.append(make_edge("agents_doc", "agents_evidence_first_debugging", "references", "EXTRACTED", 1.0, f_agents))
    edges.append(make_edge("agents_doc", "agents_frontend_completion", "references", "EXTRACTED", 1.0, f_agents))
    edges.append(make_edge("agents_evidence_first_debugging", "agents_doc", "rationale_for", "EXTRACTED", 1.0, f_agents))

    # 2. CODE_OF_CONDUCT.md
    f_coc = r"G:\AI\All lumiverse repos\Lumiverse\CODE_OF_CONDUCT.md"
    n_coc_doc = make_node("code_of_conduct_doc", "Code of Conduct Document", "document", f_coc)
    n_coc_commit = make_node("code_of_conduct_commitment", "Community Inclusivity and Professionalism Commitment", "concept", f_coc)
    n_coc_behavior = make_node("code_of_conduct_behavior_standards", "Expected and Unacceptable Community Behaviors", "concept", f_coc)
    n_coc_enforcement = make_node("code_of_conduct_reporting_enforcement", "Conduct Violation Reporting and Enforcement", "concept", f_coc)
    nodes.extend([n_coc_doc, n_coc_commit, n_coc_behavior, n_coc_enforcement])
    edges.append(make_edge("code_of_conduct_doc", "code_of_conduct_commitment", "references", "EXTRACTED", 1.0, f_coc))
    edges.append(make_edge("code_of_conduct_doc", "code_of_conduct_behavior_standards", "references", "EXTRACTED", 1.0, f_coc))
    edges.append(make_edge("code_of_conduct_doc", "code_of_conduct_reporting_enforcement", "references", "EXTRACTED", 1.0, f_coc))

    # 3. CONTRIBUTING.md
    f_contrib = r"G:\AI\All lumiverse repos\Lumiverse\CONTRIBUTING.md"
    n_contrib_doc = make_node("contributing_doc", "Lumiverse Contribution Guidelines", "document", f_contrib)
    n_contrib_staging = make_node("contributing_staging_target", "Staging Branch Target Requirement", "concept", f_contrib, rationale="All PRs must branch from and target staging, never main.")
    n_contrib_typecheck = make_node("contributing_typecheck_rules", "Backend and Frontend Typecheck Rules", "concept", f_contrib)
    n_contrib_spindle_iso = make_node("contributing_spindle_isolation", "Spindle Security System Separation", "concept", f_contrib, rationale="Keep security-sensitive Spindle changes separate from UI/UX PRs with dedicated audits.")
    n_contrib_llm_audit = make_node("contributing_llm_assisted_audit", "LLM-Assisted Code Live Audit Protocol", "concept", f_contrib)
    nodes.extend([n_contrib_doc, n_contrib_staging, n_contrib_typecheck, n_contrib_spindle_iso, n_contrib_llm_audit])
    edges.append(make_edge("contributing_doc", "contributing_staging_target", "references", "EXTRACTED", 1.0, f_contrib))
    edges.append(make_edge("contributing_doc", "contributing_typecheck_rules", "references", "EXTRACTED", 1.0, f_contrib))
    edges.append(make_edge("contributing_doc", "contributing_spindle_isolation", "references", "EXTRACTED", 1.0, f_contrib))
    edges.append(make_edge("contributing_doc", "contributing_llm_assisted_audit", "references", "EXTRACTED", 1.0, f_contrib))
    edges.append(make_edge("contributing_spindle_isolation", "contributing_doc", "rationale_for", "EXTRACTED", 1.0, f_contrib))

    # 4. docker-compose.build.yml
    f_dcb = r"G:\AI\All lumiverse repos\Lumiverse\docker-compose.build.yml"
    n_dcb_doc = make_node("docker_compose_build_config", "Docker Compose Build Configuration", "code", f_dcb)
    n_dcb_service = make_node("docker_compose_build_lumiverse_service", "Lumiverse Container Build Service", "code", f_dcb)
    n_dcb_ca = make_node("docker_compose_build_ca_refresh", "CA Certificates Refresh Cache-Bust Arg", "concept", f_dcb, rationale="Forces refresh of Debian CA trust store during image build.")
    n_dcb_vite = make_node("docker_compose_build_vite_cache_bust", "Vite Frontend Bundle Cache-Bust Arg", "concept", f_dcb)
    n_dcb_st_mig = make_node("docker_compose_build_sillytavern_migration", "SillyTavern One-Shot Migration Environment Hooks", "concept", f_dcb)
    nodes.extend([n_dcb_doc, n_dcb_service, n_dcb_ca, n_dcb_vite, n_dcb_st_mig])
    edges.append(make_edge("docker_compose_build_config", "docker_compose_build_lumiverse_service", "implements", "EXTRACTED", 1.0, f_dcb))
    edges.append(make_edge("docker_compose_build_lumiverse_service", "docker_compose_build_ca_refresh", "references", "EXTRACTED", 1.0, f_dcb))
    edges.append(make_edge("docker_compose_build_lumiverse_service", "docker_compose_build_vite_cache_bust", "references", "EXTRACTED", 1.0, f_dcb))
    edges.append(make_edge("docker_compose_build_lumiverse_service", "docker_compose_build_sillytavern_migration", "references", "EXTRACTED", 1.0, f_dcb))

    # 5. docker-compose.yml
    f_dc = r"G:\AI\All lumiverse repos\Lumiverse\docker-compose.yml"
    n_dc_doc = make_node("docker_compose_config", "Docker Compose Runtime Deployment Configuration", "code", f_dc)
    n_dc_service = make_node("docker_compose_lumiverse_service", "Lumiverse Production Runtime Service", "code", f_dc)
    n_dc_volume = make_node("docker_compose_data_volume", "Lumiverse Data Persistence Volume", "code", f_dc)
    nodes.extend([n_dc_doc, n_dc_service, n_dc_volume])
    edges.append(make_edge("docker_compose_config", "docker_compose_lumiverse_service", "implements", "EXTRACTED", 1.0, f_dc))
    edges.append(make_edge("docker_compose_lumiverse_service", "docker_compose_data_volume", "references", "EXTRACTED", 1.0, f_dc))
    edges.append(make_edge("docker_compose_config", "docker_compose_build_config", "semantically_similar_to", "INFERRED", 0.95, f_dc))

    # 6. LICENSE.md
    f_lic = r"G:\AI\All lumiverse repos\Lumiverse\LICENSE.md"
    n_lic_doc = make_node("license_doc", "Lumiverse Community License Version 2.1", "document", f_lic)
    n_lic_terms = make_node("license_grant_and_permitted_uses", "Community License Permitted Uses and Grants", "concept", f_lic)
    n_lic_acad = make_node("license_academic_publication_rights", "Academic and Research Publication Rights", "concept", f_lic)
    n_lic_comm_ext = make_node("license_community_extensions", "Community Extension and Integration Terms", "concept", f_lic)
    n_lic_restrictions = make_node("license_commercial_and_ai_restrictions", "Commercial, Government, and AI Training Prohibitions", "concept", f_lic, rationale="Protects author intellectual property from unconsented commercial exploitation and AI model ingestion.")
    nodes.extend([n_lic_doc, n_lic_terms, n_lic_acad, n_lic_comm_ext, n_lic_restrictions])
    edges.append(make_edge("license_doc", "license_grant_and_permitted_uses", "references", "EXTRACTED", 1.0, f_lic))
    edges.append(make_edge("license_doc", "license_academic_publication_rights", "references", "EXTRACTED", 1.0, f_lic))
    edges.append(make_edge("license_doc", "license_community_extensions", "references", "EXTRACTED", 1.0, f_lic))
    edges.append(make_edge("license_doc", "license_commercial_and_ai_restrictions", "references", "EXTRACTED", 1.0, f_lic))

    # 7. README.md
    f_readme = r"G:\AI\All lumiverse repos\Lumiverse\README.md"
    n_readme_doc = make_node("readme_doc", "Lumiverse Main Documentation and Readme", "document", f_readme)
    n_readme_features = make_node("readme_feature_matrix", "Lumiverse Core Architecture and Feature Overview", "concept", f_readme)
    n_readme_quickstart = make_node("readme_quickstart_guide", "Quickstart and Multi-Platform Launch Commands", "concept", f_readme)
    n_readme_st_mig = make_node("readme_sillytavern_migration_guide", "SillyTavern Data Migration Walkthrough", "concept", f_readme)
    nodes.extend([n_readme_doc, n_readme_features, n_readme_quickstart, n_readme_st_mig])
    edges.append(make_edge("readme_doc", "readme_feature_matrix", "references", "EXTRACTED", 1.0, f_readme))
    edges.append(make_edge("readme_doc", "readme_quickstart_guide", "references", "EXTRACTED", 1.0, f_readme))
    edges.append(make_edge("readme_doc", "readme_sillytavern_migration_guide", "references", "EXTRACTED", 1.0, f_readme))
    edges.append(make_edge("readme_sillytavern_migration_guide", "docker_compose_build_sillytavern_migration", "conceptually_related_to", "INFERRED", 0.95, f_readme))

    # 8. SECURITY.md
    f_sec = r"G:\AI\All lumiverse repos\Lumiverse\SECURITY.md"
    n_sec_doc = make_node("security_doc", "Lumiverse Security Policy Document", "document", f_sec)
    n_sec_versions = make_node("security_supported_versions", "Security Supported Version Matrix", "concept", f_sec)
    n_sec_reporting = make_node("security_vulnerability_reporting", "Coordinated Vulnerability Reporting Process", "concept", f_sec)
    n_sec_scope = make_node("security_audit_scope", "Security Scope and Out-of-Scope Definitions", "concept", f_sec)
    nodes.extend([n_sec_doc, n_sec_versions, n_sec_reporting, n_sec_scope])
    edges.append(make_edge("security_doc", "security_supported_versions", "references", "EXTRACTED", 1.0, f_sec))
    edges.append(make_edge("security_doc", "security_vulnerability_reporting", "references", "EXTRACTED", 1.0, f_sec))
    edges.append(make_edge("security_doc", "security_audit_scope", "references", "EXTRACTED", 1.0, f_sec))
    edges.append(make_edge("security_doc", "contributing_spindle_isolation", "conceptually_related_to", "INFERRED", 0.85, f_sec))

    # 9. conductor/index.md
    f_cond_idx = r"G:\AI\All lumiverse repos\Lumiverse\conductor\index.md"
    n_cond_idx_doc = make_node("conductor_index_doc", "Conductor Project Context and Entry Point", "document", f_cond_idx)
    n_cond_idx_def = make_node("conductor_index_definition", "Conductor Core Project Context and Governance", "concept", f_cond_idx)
    nodes.extend([n_cond_idx_doc, n_cond_idx_def])
    edges.append(make_edge("conductor_index_doc", "conductor_index_definition", "references", "EXTRACTED", 1.0, f_cond_idx))

    # 10. conductor/product-guidelines.md
    f_cond_pg = r"G:\AI\All lumiverse repos\Lumiverse\conductor\product-guidelines.md"
    n_cond_pg_doc = make_node("conductor_product_guidelines_doc", "Conductor Product and UX Guidelines", "document", f_cond_pg)
    n_cond_pg_ux = make_node("conductor_product_guidelines_brand_ux", "Brand and Visual UX Principles", "concept", f_cond_pg, rationale="Maintain premium, immersive visual depth, dark-mode ergonomics, and glassmorphism styling across all surfaces.")
    nodes.extend([n_cond_pg_doc, n_cond_pg_ux])
    edges.append(make_edge("conductor_product_guidelines_doc", "conductor_product_guidelines_brand_ux", "references", "EXTRACTED", 1.0, f_cond_pg))
    edges.append(make_edge("conductor_index_doc", "conductor_product_guidelines_doc", "references", "EXTRACTED", 1.0, f_cond_idx))

    # 11. conductor/product.md
    f_cond_prod = r"G:\AI\All lumiverse repos\Lumiverse\conductor\product.md"
    n_cond_prod_doc = make_node("conductor_product_doc", "Conductor Product Definition and Pillars", "document", f_cond_prod)
    n_cond_prod_pillars = make_node("conductor_product_core_pillars", "Lumiverse Product Core Pillars", "concept", f_cond_prod, rationale="Full local autonomy, rich narrative sandboxing, extensible modular sidecars, and uncompromising user data sovereignty.")
    nodes.extend([n_cond_prod_doc, n_cond_prod_pillars])
    edges.append(make_edge("conductor_product_doc", "conductor_product_core_pillars", "references", "EXTRACTED", 1.0, f_cond_prod))
    edges.append(make_edge("conductor_index_doc", "conductor_product_doc", "references", "EXTRACTED", 1.0, f_cond_idx))

    # 12. conductor/tech-stack.md
    f_cond_ts = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tech-stack.md"
    n_cond_ts_doc = make_node("conductor_tech_stack_doc", "Lumiverse Technical Stack Specification", "document", f_cond_ts)
    n_cond_ts_runtime = make_node("conductor_tech_stack_runtime_engine", "Bun Runtime, Vite, React, SQLite, and Tailwind Stack", "concept", f_cond_ts)
    nodes.extend([n_cond_ts_doc, n_cond_ts_runtime])
    edges.append(make_edge("conductor_tech_stack_doc", "conductor_tech_stack_runtime_engine", "references", "EXTRACTED", 1.0, f_cond_ts))
    edges.append(make_edge("conductor_index_doc", "conductor_tech_stack_doc", "references", "EXTRACTED", 1.0, f_cond_idx))
    edges.append(make_edge("conductor_tech_stack_runtime_engine", "agents_frontend_completion", "conceptually_related_to", "INFERRED", 0.85, f_cond_ts))

    # 13. conductor/tracks.md
    f_cond_tr = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks.md"
    n_cond_tr_doc = make_node("conductor_tracks_doc", "Conductor Tracks Registry", "document", f_cond_tr)
    n_cond_tr_registry = make_node("conductor_tracks_registry_index", "Active and Historical Track Registry List", "concept", f_cond_tr)
    nodes.extend([n_cond_tr_doc, n_cond_tr_registry])
    edges.append(make_edge("conductor_tracks_doc", "conductor_tracks_registry_index", "references", "EXTRACTED", 1.0, f_cond_tr))
    edges.append(make_edge("conductor_index_doc", "conductor_tracks_doc", "references", "EXTRACTED", 1.0, f_cond_idx))

    # 14. conductor/workflow.md
    f_cond_wf = r"G:\AI\All lumiverse repos\Lumiverse\conductor\workflow.md"
    n_cond_wf_doc = make_node("conductor_workflow_doc", "Conductor Workflow and Quality Gates", "document", f_cond_wf)
    n_cond_wf_gates = make_node("conductor_workflow_quality_gates", "Workflow Phases, TDD Testing, and Quality Gates", "concept", f_cond_wf, rationale="Structured progression through spec, plan, test-driven implementation, review, and verification.")
    nodes.extend([n_cond_wf_doc, n_cond_wf_gates])
    edges.append(make_edge("conductor_workflow_doc", "conductor_workflow_quality_gates", "references", "EXTRACTED", 1.0, f_cond_wf))
    edges.append(make_edge("conductor_index_doc", "conductor_workflow_doc", "references", "EXTRACTED", 1.0, f_cond_idx))
    edges.append(make_edge("conductor_workflow_quality_gates", "agents_evidence_first_debugging", "conceptually_related_to", "INFERRED", 0.95, f_cond_wf))

    # 15. conductor/code_styleguides/typescript.md
    f_cond_ts_style = r"G:\AI\All lumiverse repos\Lumiverse\conductor\code_styleguides\typescript.md"
    n_cond_ts_style_doc = make_node("conductor_code_styleguides_typescript_doc", "TypeScript Coding Styleguide", "document", f_cond_ts_style)
    n_cond_ts_rules = make_node("conductor_code_styleguides_typescript_rules", "Strict Typing, Immutability, and Error Handling Standards", "concept", f_cond_ts_style)
    nodes.extend([n_cond_ts_style_doc, n_cond_ts_rules])
    edges.append(make_edge("conductor_code_styleguides_typescript_doc", "conductor_code_styleguides_typescript_rules", "references", "EXTRACTED", 1.0, f_cond_ts_style))
    edges.append(make_edge("conductor_code_styleguides_typescript_rules", "contributing_typecheck_rules", "semantically_similar_to", "INFERRED", 0.95, f_cond_ts_style))

    # 16. conductor/tracks/lumihub_guest_nsfw_auth_fix_20260814/index.md
    f_lh_idx = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\lumihub_guest_nsfw_auth_fix_20260814\index.md"
    n_lh_idx_doc = make_node("conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_index_doc", "LumiHub Guest Auth Track Manifest", "document", f_lh_idx)
    nodes.append(n_lh_idx_doc)

    # 17. conductor/tracks/lumihub_guest_nsfw_auth_fix_20260814/plan.md
    f_lh_plan = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\lumihub_guest_nsfw_auth_fix_20260814\plan.md"
    n_lh_plan_doc = make_node("conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_plan_doc", "LumiHub Guest Auth Fix Implementation Plan", "document", f_lh_plan)
    n_lh_plan_p1 = make_node("conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_plan_p1", "LumiHub Plan Phase 1: Userscript Analysis and Interceptor Fix", "concept", f_lh_plan)
    n_lh_plan_p2 = make_node("conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_plan_p2", "LumiHub Plan Phase 2: Offline Integration Strategy", "concept", f_lh_plan)
    n_lh_plan_p3 = make_node("conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_plan_p3", "LumiHub Plan Phase 3: Validation and Handoff", "concept", f_lh_plan)
    nodes.extend([n_lh_plan_doc, n_lh_plan_p1, n_lh_plan_p2, n_lh_plan_p3])
    edges.append(make_edge("conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_plan_doc", "conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_plan_p1", "references", "EXTRACTED", 1.0, f_lh_plan))
    edges.append(make_edge("conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_plan_doc", "conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_plan_p2", "references", "EXTRACTED", 1.0, f_lh_plan))
    edges.append(make_edge("conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_plan_doc", "conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_plan_p3", "references", "EXTRACTED", 1.0, f_lh_plan))
    edges.append(make_edge("conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_index_doc", "conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_plan_doc", "references", "EXTRACTED", 1.0, f_lh_idx))

    # 18. conductor/tracks/lumihub_guest_nsfw_auth_fix_20260814/spec.md
    f_lh_spec = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\lumihub_guest_nsfw_auth_fix_20260814\spec.md"
    n_lh_spec_doc = make_node("conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_spec_doc", "LumiHub Guest Auth Fix Specification", "document", f_lh_spec)
    n_lh_spec_reqs = make_node("conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_spec_reqs", "LumiHub Guest Auth & Tampermonkey NSFW Script Requirements", "concept", f_lh_spec)
    nodes.extend([n_lh_spec_doc, n_lh_spec_reqs])
    edges.append(make_edge("conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_spec_doc", "conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_spec_reqs", "references", "EXTRACTED", 1.0, f_lh_spec))
    edges.append(make_edge("conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_plan_doc", "conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_spec_doc", "implements", "EXTRACTED", 1.0, f_lh_plan))
    edges.append(make_edge("conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_index_doc", "conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_spec_doc", "references", "EXTRACTED", 1.0, f_lh_idx))

    # 19. conductor/tracks/spindle_extensibility_ui_modernization_20260816/index.md
    f_sp_idx = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_extensibility_ui_modernization_20260816\index.md"
    n_sp_idx_doc = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_index_doc", "Spindle Extensibility V2 Track Manifest", "document", f_sp_idx)
    nodes.append(n_sp_idx_doc)

    # 20. conductor/tracks/spindle_extensibility_ui_modernization_20260816/plan.md
    f_sp_plan = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_extensibility_ui_modernization_20260816\plan.md"
    n_sp_plan_doc = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_doc", "Spindle Extensibility V2 & UI Modernization Master Plan", "document", f_sp_plan)
    n_sp_contract = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_operating_contract", "Spindle Modernization Operating Contract and Invariants", "concept", f_sp_plan, rationale="Enforce additive compatibility, isolated registries, robust validation, and single-source evidence ledgers.")
    n_sp_p0 = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase0_baseline", "Phase 0: Baseline, Contract Decisions, and Release Chain", "concept", f_sp_plan)
    n_sp_p1 = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase1_public_sdk", "Phase 1: Public SDK and Existing Host Contract Promotion", "concept", f_sp_plan)
    n_sp_p2 = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase2_universal_mounts", "Phase 2: Universal Mounts, Decorators, and Settings/Message Anchors", "concept", f_sp_plan)
    n_sp_p3 = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase3_registries", "Phase 3: Dynamic Provider and Driver Registries", "concept", f_sp_plan)
    n_sp_p4 = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase4_toolbar_picker", "Phase 4: Quick Toolbar, Docker Actions, and Connection Picker", "concept", f_sp_plan)
    n_sp_p5 = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase5_embeddings_memory", "Phase 5: Embeddings, Memory Cortex, Settings, and Edit-and-Send", "concept", f_sp_plan)
    n_sp_p6 = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase6_verification", "Phase 6: Full Verification, Manual Acceptance, and Handoff", "concept", f_sp_plan)
    
    nodes.extend([n_sp_plan_doc, n_sp_contract, n_sp_p0, n_sp_p1, n_sp_p2, n_sp_p3, n_sp_p4, n_sp_p5, n_sp_p6])
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_operating_contract", "references", "EXTRACTED", 1.0, f_sp_plan))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase0_baseline", "references", "EXTRACTED", 1.0, f_sp_plan))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase1_public_sdk", "references", "EXTRACTED", 1.0, f_sp_plan))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase2_universal_mounts", "references", "EXTRACTED", 1.0, f_sp_plan))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase3_registries", "references", "EXTRACTED", 1.0, f_sp_plan))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase4_toolbar_picker", "references", "EXTRACTED", 1.0, f_sp_plan))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase5_embeddings_memory", "references", "EXTRACTED", 1.0, f_sp_plan))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase6_verification", "references", "EXTRACTED", 1.0, f_sp_plan))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_index_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_doc", "references", "EXTRACTED", 1.0, f_sp_idx))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_operating_contract", "contributing_spindle_isolation", "conceptually_related_to", "INFERRED", 0.95, f_sp_plan))

    # Cross-file Inferred couplings (DEEP_MODE=true)
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase6_verification", "agents_frontend_completion", "implements", "INFERRED", 0.95, f_sp_plan))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase6_verification", "agents_evidence_first_debugging", "references", "INFERRED", 0.85, f_sp_plan))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase1_public_sdk", "license_community_extensions", "implements", "INFERRED", 0.85, f_sp_plan))
    edges.append(make_edge("conductor_tracks_registry_index", "conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_index_doc", "references", "INFERRED", 0.95, f_cond_tr))
    edges.append(make_edge("conductor_tracks_registry_index", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_index_doc", "references", "INFERRED", 0.95, f_cond_tr))

    # Hyperedges
    hyperedges.append(make_hyperedge(
        "he_conductor_governance_system",
        "Conductor Project Governance, Tech Stack, and Workflow System",
        [
            "conductor_index_doc",
            "conductor_product_doc",
            "conductor_product_guidelines_doc",
            "conductor_tech_stack_doc",
            "conductor_tracks_doc",
            "conductor_workflow_doc",
            "conductor_code_styleguides_typescript_doc"
        ],
        "form",
        "EXTRACTED",
        1.0,
        f_cond_idx
    ))

    hyperedges.append(make_hyperedge(
        "he_repository_baseline_standards",
        "Repository Standards, Security, Licensing, and Development Guidelines",
        [
            "agents_doc",
            "code_of_conduct_doc",
            "contributing_doc",
            "license_doc",
            "readme_doc",
            "security_doc",
            "docker_compose_config",
            "docker_compose_build_config"
        ],
        "form",
        "EXTRACTED",
        1.0,
        f_readme
    ))

    hyperedges.append(make_hyperedge(
        "he_lumihub_guest_auth_track",
        "LumiHub Guest Auth and NSFW Tampermonkey Script Fix Track",
        [
            "conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_index_doc",
            "conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_plan_doc",
            "conductor_tracks_lumihub_guest_nsfw_auth_fix_20260814_spec_doc"
        ],
        "implement",
        "EXTRACTED",
        1.0,
        f_lh_idx
    ))

    hyperedges.append(make_hyperedge(
        "he_spindle_extensibility_master_plan",
        "Spindle Extensibility V2 and Universal UI Architecture Master Plan",
        [
            "conductor_tracks_spindle_extensibility_ui_modernization_20260816_index_doc",
            "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_doc",
            "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_operating_contract",
            "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase0_baseline",
            "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase1_public_sdk",
            "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase2_universal_mounts",
            "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase3_registries",
            "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase4_toolbar_picker",
            "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase5_embeddings_memory",
            "conductor_tracks_spindle_extensibility_ui_modernization_20260816_plan_phase6_verification"
        ],
        "implement",
        "EXTRACTED",
        1.0,
        f_sp_plan
    ))

    result = {
        "nodes": nodes,
        "edges": edges,
        "hyperedges": hyperedges,
        "input_tokens": 0,
        "output_tokens": 0
    }
    return result

if __name__ == "__main__":
    c1 = build_chunk_01()
    out_path = os.path.join(repo_root, "graphify-out", ".graphify_chunk_01.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(c1, f, indent=2)
    print(f"Wrote Chunk 01 with {len(c1['nodes'])} nodes, {len(c1['edges'])} edges, {len(c1['hyperedges'])} hyperedges to {out_path}")
