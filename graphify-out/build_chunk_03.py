import json
import re
from pathlib import Path

repo_root = Path(r"G:\AI\All lumiverse repos\Lumiverse")

FILES_CHUNK_03 = [
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_toolbar_dock_composer_20260817\handoff\grok_complete_handoff.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_toolbar_dock_composer_20260817\handoff\grok_status_handoff_20260818.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\userscript_lumihub_1click_bridge_20260814\index.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\userscript_lumihub_1click_bridge_20260814\plan.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\userscript_lumihub_1click_bridge_20260814\spec.md",
    r"G:\AI\All lumiverse repos\Lumiverse\desktop\custom-url.html",
    r"G:\AI\All lumiverse repos\Lumiverse\desktop\index.html",
    r"G:\AI\All lumiverse repos\Lumiverse\desktop\README.md",
    r"G:\AI\All lumiverse repos\Lumiverse\desktop\widget.html",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\frontend-processes.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\index.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\lifecycle.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\rest-api.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\backend-processes.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\characters.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\chat-mutation.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\chats.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\commands.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\context-handlers.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\cors-proxy.md",
]

def get_stem(file_path_str):
    rel = Path(file_path_str).relative_to(repo_root)
    rel_without_ext = rel.with_suffix('')
    parts = []
    for part in rel_without_ext.parts:
        cleaned = re.sub(r'[^a-zA-Z0-9_]', '_', part).lower()
        parts.append(cleaned)
    return '_'.join(parts)

def make_id(file_path_str, entity=''):
    stem = get_stem(file_path_str)
    if not entity:
        return stem
    clean_entity = re.sub(r'[^a-zA-Z0-9_]', '_', entity).lower().strip('_')
    return f"{stem}_{clean_entity}"

def build_chunk_03():
    nodes = []
    edges = []

    f_grok_comp = FILES_CHUNK_03[0]
    f_grok_stat = FILES_CHUNK_03[1]
    f_us_idx = FILES_CHUNK_03[2]
    f_us_plan = FILES_CHUNK_03[3]
    f_us_spec = FILES_CHUNK_03[4]
    f_dt_url = FILES_CHUNK_03[5]
    f_dt_idx = FILES_CHUNK_03[6]
    f_dt_readme = FILES_CHUNK_03[7]
    f_dt_widget = FILES_CHUNK_03[8]
    f_doc_fe_proc = FILES_CHUNK_03[9]
    f_doc_idx = FILES_CHUNK_03[10]
    f_doc_life = FILES_CHUNK_03[11]
    f_doc_rest = FILES_CHUNK_03[12]
    f_doc_be_proc = FILES_CHUNK_03[13]
    f_doc_chars = FILES_CHUNK_03[14]
    f_doc_mut = FILES_CHUNK_03[15]
    f_doc_chats = FILES_CHUNK_03[16]
    f_doc_cmds = FILES_CHUNK_03[17]
    f_doc_ctx = FILES_CHUNK_03[18]
    f_doc_cors = FILES_CHUNK_03[19]

    # 1. grok_complete_handoff.md
    id_grok_comp_doc = make_id(f_grok_comp)
    id_grok_comp_t1 = make_id(f_grok_comp, 'ticket_1_pointer_hold_duration')
    id_grok_comp_t2 = make_id(f_grok_comp, 'ticket_2_drag_reorder_affordances')
    id_grok_comp_t3 = make_id(f_grok_comp, 'ticket_3_waypoints_launcher')
    id_grok_comp_t4 = make_id(f_grok_comp, 'ticket_4_pin_customize_gear')
    id_grok_comp_t5 = make_id(f_grok_comp, 'ticket_5_floating_v2_geometry')
    id_grok_comp_redbox = make_id(f_grok_comp, 'redbox_layout_bugs')
    id_grok_comp_devtools = make_id(f_grok_comp, 'scripts_live_devtools_fixes')

    nodes.extend([
        {"id": id_grok_comp_doc, "label": "Grok Complete Engineering Handoff Doc", "file_type": "document", "source_file": f_grok_comp, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_grok_comp_t1, "label": "Pointer Hold Duration Reduction (500ms)", "file_type": "concept", "source_file": f_grok_comp, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_grok_comp_t2, "label": "Toolbar Drag & Reorder Affordances", "file_type": "concept", "source_file": f_grok_comp, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_grok_comp_t3, "label": "Waypoints Connections Composer Launcher", "file_type": "concept", "source_file": f_grok_comp, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_grok_comp_t4, "label": "Customize Composer Gear Pinning", "file_type": "concept", "source_file": f_grok_comp, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_grok_comp_t5, "label": "Floating V2 Geometry Contract", "file_type": "concept", "source_file": f_grok_comp, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_grok_comp_redbox, "label": "Four Red-Box Layout Bug Fixes", "file_type": "concept", "source_file": f_grok_comp, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_grok_comp_devtools, "label": "Live DevTools Fixes Script Reference", "file_type": "code", "source_file": f_grok_comp, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_grok_comp_doc, "target": id_grok_comp_t1, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_grok_comp, "source_location": None, "weight": 1.0},
        {"source": id_grok_comp_doc, "target": id_grok_comp_t2, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_grok_comp, "source_location": None, "weight": 1.0},
        {"source": id_grok_comp_doc, "target": id_grok_comp_t3, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_grok_comp, "source_location": None, "weight": 1.0},
        {"source": id_grok_comp_doc, "target": id_grok_comp_t4, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_grok_comp, "source_location": None, "weight": 1.0},
        {"source": id_grok_comp_doc, "target": id_grok_comp_t5, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_grok_comp, "source_location": None, "weight": 1.0},
        {"source": id_grok_comp_doc, "target": id_grok_comp_redbox, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_grok_comp, "source_location": None, "weight": 1.0},
        {"source": id_grok_comp_doc, "target": id_grok_comp_devtools, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_grok_comp, "source_location": None, "weight": 1.0},
        {"source": id_grok_comp_t2, "target": id_grok_comp_t1, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_grok_comp, "source_location": None, "weight": 1.0},
        {"source": id_grok_comp_t5, "target": id_grok_comp_redbox, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_grok_comp, "source_location": None, "weight": 1.0},
    ])

    # 2. grok_status_handoff_20260818.md
    id_grok_stat_doc = make_id(f_grok_stat)
    id_grok_stat_regress = make_id(f_grok_stat, 'floating_geometry_regression')
    id_grok_stat_pwa = make_id(f_grok_stat, 'pwa_service_worker_invalidation')
    id_grok_stat_chatcol = make_id(f_grok_stat, 'chat_column_boundary_contract')

    nodes.extend([
        {"id": id_grok_stat_doc, "label": "Grok Status Handoff 2026-08-18 Doc", "file_type": "document", "source_file": f_grok_stat, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_grok_stat_regress, "label": "Floating Geometry Regression Diagnosis", "file_type": "rationale", "source_file": f_grok_stat, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_grok_stat_pwa, "label": "PWA Service Worker Cache Invalidation", "file_type": "concept", "source_file": f_grok_stat, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_grok_stat_chatcol, "label": "Chat Column Boundary Contract", "file_type": "concept", "source_file": f_grok_stat, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_grok_stat_doc, "target": id_grok_stat_regress, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_grok_stat, "source_location": None, "weight": 1.0},
        {"source": id_grok_stat_doc, "target": id_grok_stat_pwa, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_grok_stat, "source_location": None, "weight": 1.0},
        {"source": id_grok_stat_doc, "target": id_grok_stat_chatcol, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_grok_stat, "source_location": None, "weight": 1.0},
        {"source": id_grok_stat_doc, "target": id_grok_comp_doc, "relation": "cites", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_grok_stat, "source_location": None, "weight": 1.0},
        {"source": id_grok_stat_regress, "target": id_grok_comp_t5, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_grok_stat, "source_location": None, "weight": 1.0},
        {"source": id_grok_stat_chatcol, "target": id_grok_comp_t5, "relation": "shares_data_with", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_grok_stat, "source_location": None, "weight": 1.0},
    ])

    # 3. userscript index.md
    id_us_idx_doc = make_id(f_us_idx)
    id_us_idx_artifacts = make_id(f_us_idx, 'track_artifacts_index')
    nodes.extend([
        {"id": id_us_idx_doc, "label": "Userscript 1-Click Bridge Track Index", "file_type": "document", "source_file": f_us_idx, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_us_idx_artifacts, "label": "Userscript Track Artifacts Registry", "file_type": "concept", "source_file": f_us_idx, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_us_idx_doc, "target": id_us_idx_artifacts, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_us_idx, "source_location": None, "weight": 1.0},
    ])

    # 4. userscript plan.md
    id_us_plan_doc = make_id(f_us_plan)
    id_us_plan_p1 = make_id(f_us_plan, 'phase_1_safe_transport_plan')
    id_us_plan_p2 = make_id(f_us_plan, 'phase_2_preset_identity_merge_plan')
    id_us_plan_p3 = make_id(f_us_plan, 'phase_3_react_dom_injection_plan')
    nodes.extend([
        {"id": id_us_plan_doc, "label": "Userscript Bridge Implementation Plan", "file_type": "document", "source_file": f_us_plan, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_us_plan_p1, "label": "Safe Transport & Auto-Discovery Plan", "file_type": "concept", "source_file": f_us_plan, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_us_plan_p2, "label": "Deterministic Preset Identity & Merge Plan", "file_type": "concept", "source_file": f_us_plan, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_us_plan_p3, "label": "React SPA DOM Injection Plan", "file_type": "concept", "source_file": f_us_plan, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_us_plan_doc, "target": id_us_plan_p1, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_us_plan, "source_location": None, "weight": 1.0},
        {"source": id_us_plan_doc, "target": id_us_plan_p2, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_us_plan, "source_location": None, "weight": 1.0},
        {"source": id_us_plan_doc, "target": id_us_plan_p3, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_us_plan, "source_location": None, "weight": 1.0},
        {"source": id_us_idx_doc, "target": id_us_plan_doc, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_us_idx, "source_location": None, "weight": 1.0},
    ])

    # 5. userscript spec.md
    id_us_spec_doc = make_id(f_us_spec)
    id_us_spec_zero = make_id(f_us_spec, 'zero_core_mod_architecture')
    id_us_spec_5tier = make_id(f_us_spec, 'five_tier_preset_matcher')
    id_us_spec_3tier = make_id(f_us_spec, 'three_tier_block_matcher')
    id_us_spec_retry = make_id(f_us_spec, 'conflict_retry_loop')
    id_us_spec_tm = make_id(f_us_spec, 'tampermonkey_grant_headers')
    nodes.extend([
        {"id": id_us_spec_doc, "label": "Userscript Bridge Specification", "file_type": "document", "source_file": f_us_spec, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_us_spec_zero, "label": "Zero Core Modification Architecture", "file_type": "rationale", "source_file": f_us_spec, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_us_spec_5tier, "label": "5-Tier Deterministic Preset Identity Matcher", "file_type": "concept", "source_file": f_us_spec, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_us_spec_3tier, "label": "3-Tier Preset Block Matcher", "file_type": "concept", "source_file": f_us_spec, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_us_spec_retry, "label": "409 Conflict Retry Loop via expected_cache_revision", "file_type": "concept", "source_file": f_us_spec, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_us_spec_tm, "label": "Tampermonkey Privileged Grant Headers", "file_type": "code", "source_file": f_us_spec, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_us_spec_doc, "target": id_us_spec_zero, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_us_spec, "source_location": None, "weight": 1.0},
        {"source": id_us_spec_doc, "target": id_us_spec_5tier, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_us_spec, "source_location": None, "weight": 1.0},
        {"source": id_us_spec_doc, "target": id_us_spec_3tier, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_us_spec, "source_location": None, "weight": 1.0},
        {"source": id_us_spec_doc, "target": id_us_spec_retry, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_us_spec, "source_location": None, "weight": 1.0},
        {"source": id_us_spec_doc, "target": id_us_spec_tm, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_us_spec, "source_location": None, "weight": 1.0},
        {"source": id_us_plan_doc, "target": id_us_spec_doc, "relation": "implements", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_us_plan, "source_location": None, "weight": 1.0},
        {"source": id_us_idx_doc, "target": id_us_spec_doc, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_us_idx, "source_location": None, "weight": 1.0},
        {"source": id_us_spec_5tier, "target": id_us_plan_p2, "relation": "shares_data_with", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_us_spec, "source_location": None, "weight": 1.0},
        {"source": id_us_spec_zero, "target": id_us_spec_tm, "relation": "rationale_for", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_us_spec, "source_location": None, "weight": 1.0},
    ])

    # 6. desktop/custom-url.html
    id_dt_url_doc = make_id(f_dt_url)
    id_dt_url_form = make_id(f_dt_url, 'frontend_url_input_form')
    id_dt_url_persist = make_id(f_dt_url, 'custom_origin_persistence')
    nodes.extend([
        {"id": id_dt_url_doc, "label": "Desktop Custom URL Config Page", "file_type": "document", "source_file": f_dt_url, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_dt_url_form, "label": "Frontend URL Configuration Form", "file_type": "code", "source_file": f_dt_url, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_dt_url_persist, "label": "Custom Origin Persistence Setting", "file_type": "concept", "source_file": f_dt_url, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_dt_url_doc, "target": id_dt_url_form, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_dt_url, "source_location": None, "weight": 1.0},
        {"source": id_dt_url_doc, "target": id_dt_url_persist, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_dt_url, "source_location": None, "weight": 1.0},
    ])

    # 7. desktop/index.html
    id_dt_idx_doc = make_id(f_dt_idx)
    id_dt_idx_entry = make_id(f_dt_idx, 'tray_host_runtime_entry')
    nodes.extend([
        {"id": id_dt_idx_doc, "label": "Desktop Main Window Entry HTML", "file_type": "document", "source_file": f_dt_idx, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_dt_idx_entry, "label": "Tray Host Main Module Loader", "file_type": "code", "source_file": f_dt_idx, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_dt_idx_doc, "target": id_dt_idx_entry, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_dt_idx, "source_location": None, "weight": 1.0},
    ])

    # 8. desktop/README.md
    id_dt_readme_doc = make_id(f_dt_readme)
    id_dt_readme_tauri = make_id(f_dt_readme, 'tauri_desktop_core')
    id_dt_readme_runner = make_id(f_dt_readme, 'headless_runner_spawning')
    id_dt_readme_stdio = make_id(f_dt_readme, 'stdio_operator_ipc')
    id_dt_readme_vibrancy = make_id(f_dt_readme, 'translucent_theme_support')
    nodes.extend([
        {"id": id_dt_readme_doc, "label": "Lumiverse Desktop Developer README", "file_type": "document", "source_file": f_dt_readme, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_dt_readme_tauri, "label": "Tauri Desktop Core Architecture", "file_type": "concept", "source_file": f_dt_readme, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_dt_readme_runner, "label": "Headless Server Runner Spawning", "file_type": "code", "source_file": f_dt_readme, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_dt_readme_stdio, "label": "Stdio Protocol Operator IPC", "file_type": "concept", "source_file": f_dt_readme, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_dt_readme_vibrancy, "label": "Native Window Translucent Vibrancy", "file_type": "concept", "source_file": f_dt_readme, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_dt_readme_doc, "target": id_dt_readme_tauri, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_dt_readme, "source_location": None, "weight": 1.0},
        {"source": id_dt_readme_doc, "target": id_dt_readme_runner, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_dt_readme, "source_location": None, "weight": 1.0},
        {"source": id_dt_readme_doc, "target": id_dt_readme_stdio, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_dt_readme, "source_location": None, "weight": 1.0},
        {"source": id_dt_readme_doc, "target": id_dt_readme_vibrancy, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_dt_readme, "source_location": None, "weight": 1.0},
        {"source": id_dt_readme_doc, "target": id_dt_idx_doc, "relation": "references", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_dt_readme, "source_location": None, "weight": 1.0},
        {"source": id_dt_readme_doc, "target": id_dt_url_doc, "relation": "references", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_dt_readme, "source_location": None, "weight": 1.0},
        {"source": id_dt_readme_runner, "target": id_dt_readme_stdio, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_dt_readme, "source_location": None, "weight": 1.0},
    ])

    # 9. desktop/widget.html
    id_dt_widget_doc = make_id(f_dt_widget)
    id_dt_widget_container = make_id(f_dt_widget, 'desktop_widget_container')
    nodes.extend([
        {"id": id_dt_widget_doc, "label": "Desktop Widget Host HTML", "file_type": "document", "source_file": f_dt_widget, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_dt_widget_container, "label": "Desktop Widget Container Frame", "file_type": "code", "source_file": f_dt_widget, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_dt_widget_doc, "target": id_dt_widget_container, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_dt_widget, "source_location": None, "weight": 1.0},
        {"source": id_dt_readme_doc, "target": id_dt_widget_doc, "relation": "references", "confidence": "INFERRED", "confidence_score": 0.75, "source_file": f_dt_readme, "source_location": None, "weight": 1.0},
    ])

    # 10. developer-docs/docs/frontend-processes.md
    id_doc_fe_proc_doc = make_id(f_doc_fe_proc)
    id_doc_fe_proc_race = make_id(f_doc_fe_proc, 'hydration_race_root_cause')
    id_doc_fe_proc_guard = make_id(f_doc_fe_proc, 'settings_synchronization_guardrails')
    id_doc_fe_proc_rev = make_id(f_doc_fe_proc, 'local_settings_revision_tracking')
    nodes.extend([
        {"id": id_doc_fe_proc_doc, "label": "Portrait Dock Settings Hydration Race Doc", "file_type": "document", "source_file": f_doc_fe_proc, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_fe_proc_race, "label": "Dock Settings Hydration Race Condition", "file_type": "rationale", "source_file": f_doc_fe_proc, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_fe_proc_guard, "label": "Settings Synchronization Guardrails", "file_type": "concept", "source_file": f_doc_fe_proc, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_fe_proc_rev, "label": "Local Settings Revision Tracker", "file_type": "concept", "source_file": f_doc_fe_proc, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_doc_fe_proc_doc, "target": id_doc_fe_proc_race, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_fe_proc, "source_location": None, "weight": 1.0},
        {"source": id_doc_fe_proc_doc, "target": id_doc_fe_proc_guard, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_fe_proc, "source_location": None, "weight": 1.0},
        {"source": id_doc_fe_proc_doc, "target": id_doc_fe_proc_rev, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_fe_proc, "source_location": None, "weight": 1.0},
        {"source": id_doc_fe_proc_race, "target": id_doc_fe_proc_guard, "relation": "rationale_for", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_doc_fe_proc, "source_location": None, "weight": 1.0},
    ])

    # 11. developer-docs/docs/index.md
    id_doc_idx_doc = make_id(f_doc_idx)
    id_doc_idx_framework = make_id(f_doc_idx, 'spindle_framework_core')
    id_doc_idx_proc = make_id(f_doc_idx, 'bun_subprocess_process_mode')
    id_doc_idx_perm = make_id(f_doc_idx, 'spindle_tiered_permissions')
    nodes.extend([
        {"id": id_doc_idx_doc, "label": "Spindle Extension Developer Guide Index", "file_type": "document", "source_file": f_doc_idx, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_idx_framework, "label": "Spindle Extension Framework Core", "file_type": "concept", "source_file": f_doc_idx, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_idx_proc, "label": "Bun Subprocess Process Mode", "file_type": "concept", "source_file": f_doc_idx, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_idx_perm, "label": "Spindle Tiered Permission Model", "file_type": "concept", "source_file": f_doc_idx, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_doc_idx_doc, "target": id_doc_idx_framework, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_idx, "source_location": None, "weight": 1.0},
        {"source": id_doc_idx_doc, "target": id_doc_idx_proc, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_idx, "source_location": None, "weight": 1.0},
        {"source": id_doc_idx_doc, "target": id_doc_idx_perm, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_idx, "source_location": None, "weight": 1.0},
        {"source": id_doc_idx_framework, "target": id_doc_idx_proc, "relation": "implements", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_doc_idx, "source_location": None, "weight": 1.0},
    ])

    # 12. developer-docs/docs/lifecycle.md
    id_doc_life_doc = make_id(f_doc_life)
    id_doc_life_install = make_id(f_doc_life, 'spindle_install_pipeline')
    id_doc_life_enable = make_id(f_doc_life, 'spindle_enable_disable_flow')
    id_doc_life_grace = make_id(f_doc_life, 'spindle_shutdown_grace_period')
    nodes.extend([
        {"id": id_doc_life_doc, "label": "Spindle Extension Lifecycle Guide", "file_type": "document", "source_file": f_doc_life, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_life_install, "label": "Extension Installation & Build Pipeline", "file_type": "concept", "source_file": f_doc_life, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_life_enable, "label": "Extension Enable/Disable Graceful Flow", "file_type": "concept", "source_file": f_doc_life, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_life_grace, "label": "5-Second Graceful Shutdown Protocol", "file_type": "concept", "source_file": f_doc_life, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_doc_life_doc, "target": id_doc_life_install, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_life, "source_location": None, "weight": 1.0},
        {"source": id_doc_life_doc, "target": id_doc_life_enable, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_life, "source_location": None, "weight": 1.0},
        {"source": id_doc_life_doc, "target": id_doc_life_grace, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_life, "source_location": None, "weight": 1.0},
        {"source": id_doc_idx_doc, "target": id_doc_life_doc, "relation": "references", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_doc_idx, "source_location": None, "weight": 1.0},
        {"source": id_doc_life_enable, "target": id_doc_life_grace, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_doc_life, "source_location": None, "weight": 1.0},
    ])

    # 13. developer-docs/docs/rest-api.md
    id_doc_rest_doc = make_id(f_doc_rest)
    id_doc_rest_settings = make_id(f_doc_rest, 'settings_rest_endpoints')
    id_doc_rest_spindle = make_id(f_doc_rest, 'spindle_rest_endpoints')
    id_doc_rest_landing = make_id(f_doc_rest, 'landing_page_display_api')
    nodes.extend([
        {"id": id_doc_rest_doc, "label": "Lumiverse REST API Reference", "file_type": "document", "source_file": f_doc_rest, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_rest_settings, "label": "Settings REST Endpoints (/api/v1/settings)", "file_type": "code", "source_file": f_doc_rest, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_rest_spindle, "label": "Spindle Management Endpoints (/api/v1/spindle)", "file_type": "code", "source_file": f_doc_rest, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_rest_landing, "label": "Landing Page Display Settings API", "file_type": "concept", "source_file": f_doc_rest, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_doc_rest_doc, "target": id_doc_rest_settings, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_rest, "source_location": None, "weight": 1.0},
        {"source": id_doc_rest_doc, "target": id_doc_rest_spindle, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_rest, "source_location": None, "weight": 1.0},
        {"source": id_doc_rest_doc, "target": id_doc_rest_landing, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_rest, "source_location": None, "weight": 1.0},
        {"source": id_doc_rest_settings, "target": id_doc_fe_proc_guard, "relation": "shares_data_with", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_doc_rest, "source_location": None, "weight": 1.0},
    ])

    # 14. developer-docs/docs/backend-api/backend-processes.md
    id_doc_be_proc_doc = make_id(f_doc_be_proc)
    id_doc_be_proc_spawn = make_id(f_doc_be_proc, 'spindle_backend_processes_spawn')
    id_doc_be_proc_sup = make_id(f_doc_be_proc, 'backend_process_supervision_protocol')
    id_doc_be_proc_hb = make_id(f_doc_be_proc, 'backend_process_heartbeat_monitor')
    nodes.extend([
        {"id": id_doc_be_proc_doc, "label": "Backend Process Lifecycle API Doc", "file_type": "document", "source_file": f_doc_be_proc, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_be_proc_spawn, "label": "spindle.backendProcesses.spawn Method", "file_type": "code", "source_file": f_doc_be_proc, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_be_proc_sup, "label": "Backend Subprocess Supervision Protocol", "file_type": "concept", "source_file": f_doc_be_proc, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_be_proc_hb, "label": "Backend Subprocess Heartbeat Monitor", "file_type": "concept", "source_file": f_doc_be_proc, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_doc_be_proc_doc, "target": id_doc_be_proc_spawn, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_be_proc, "source_location": None, "weight": 1.0},
        {"source": id_doc_be_proc_doc, "target": id_doc_be_proc_sup, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_be_proc, "source_location": None, "weight": 1.0},
        {"source": id_doc_be_proc_doc, "target": id_doc_be_proc_hb, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_be_proc, "source_location": None, "weight": 1.0},
        {"source": id_doc_be_proc_sup, "target": id_doc_be_proc_hb, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_doc_be_proc, "source_location": None, "weight": 1.0},
    ])

    # 15. developer-docs/docs/backend-api/characters.md
    id_doc_chars_doc = make_id(f_doc_chars)
    id_doc_chars_crud = make_id(f_doc_chars, 'spindle_characters_crud')
    id_doc_chars_dto = make_id(f_doc_chars, 'character_dto_schema')
    id_doc_chars_wb = make_id(f_doc_chars, 'character_worldbook_binding')
    nodes.extend([
        {"id": id_doc_chars_doc, "label": "Spindle Characters API Doc", "file_type": "document", "source_file": f_doc_chars, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_chars_crud, "label": "spindle.characters CRUD API", "file_type": "code", "source_file": f_doc_chars, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_chars_dto, "label": "CharacterDTO Data Transfer Object", "file_type": "code", "source_file": f_doc_chars, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_chars_wb, "label": "Character Worldbook Binding API", "file_type": "concept", "source_file": f_doc_chars, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_doc_chars_doc, "target": id_doc_chars_crud, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_chars, "source_location": None, "weight": 1.0},
        {"source": id_doc_chars_doc, "target": id_doc_chars_dto, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_chars, "source_location": None, "weight": 1.0},
        {"source": id_doc_chars_doc, "target": id_doc_chars_wb, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_chars, "source_location": None, "weight": 1.0},
        {"source": id_doc_chars_crud, "target": id_doc_chars_dto, "relation": "shares_data_with", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_doc_chars, "source_location": None, "weight": 1.0},
    ])

    # 16. developer-docs/docs/backend-api/chat-mutation.md
    id_doc_mut_doc = make_id(f_doc_mut)
    id_doc_mut_methods = make_id(f_doc_mut, 'spindle_chat_mutation_methods')
    id_doc_mut_append = make_id(f_doc_mut, 'append_and_generate_api')
    id_doc_mut_swipes = make_id(f_doc_mut, 'message_swipe_patch_schema')
    nodes.extend([
        {"id": id_doc_mut_doc, "label": "Spindle Chat Mutation API Doc", "file_type": "document", "source_file": f_doc_mut, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_mut_methods, "label": "spindle.chat Mutation Methods", "file_type": "code", "source_file": f_doc_mut, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_mut_append, "label": "Append and Generate Atomic Operation", "file_type": "concept", "source_file": f_doc_mut, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_mut_swipes, "label": "Message Swipe Patch Schema", "file_type": "code", "source_file": f_doc_mut, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_doc_mut_doc, "target": id_doc_mut_methods, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_mut, "source_location": None, "weight": 1.0},
        {"source": id_doc_mut_doc, "target": id_doc_mut_append, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_mut, "source_location": None, "weight": 1.0},
        {"source": id_doc_mut_doc, "target": id_doc_mut_swipes, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_mut, "source_location": None, "weight": 1.0},
        {"source": id_doc_mut_methods, "target": id_doc_mut_swipes, "relation": "shares_data_with", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_doc_mut, "source_location": None, "weight": 1.0},
    ])

    # 17. developer-docs/docs/backend-api/chats.md
    id_doc_chats_doc = make_id(f_doc_chats)
    id_doc_chats_crud = make_id(f_doc_chats, 'spindle_chats_crud')
    id_doc_chats_dto = make_id(f_doc_chats, 'chat_dto_schema')
    id_doc_chats_active = make_id(f_doc_chats, 'active_chat_subscription')
    nodes.extend([
        {"id": id_doc_chats_doc, "label": "Spindle Chats Session API Doc", "file_type": "document", "source_file": f_doc_chats, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_chats_crud, "label": "spindle.chats Session CRUD API", "file_type": "code", "source_file": f_doc_chats, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_chats_dto, "label": "ChatDTO Data Transfer Object", "file_type": "code", "source_file": f_doc_chats, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_chats_active, "label": "Active Chat Session Subscription", "file_type": "concept", "source_file": f_doc_chats, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_doc_chats_doc, "target": id_doc_chats_crud, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_chats, "source_location": None, "weight": 1.0},
        {"source": id_doc_chats_doc, "target": id_doc_chats_dto, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_chats, "source_location": None, "weight": 1.0},
        {"source": id_doc_chats_doc, "target": id_doc_chats_active, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_chats, "source_location": None, "weight": 1.0},
        {"source": id_doc_chats_doc, "target": id_doc_mut_doc, "relation": "cites", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_chats, "source_location": None, "weight": 1.0},
        {"source": id_doc_chats_crud, "target": id_doc_chars_crud, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_doc_chats, "source_location": None, "weight": 1.0},
        {"source": id_doc_chats_dto, "target": id_doc_mut_methods, "relation": "shares_data_with", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_doc_chats, "source_location": None, "weight": 1.0},
    ])

    # 18. developer-docs/docs/backend-api/commands.md
    id_doc_cmds_doc = make_id(f_doc_cmds)
    id_doc_cmds_reg = make_id(f_doc_cmds, 'spindle_commands_register')
    id_doc_cmds_ctx = make_id(f_doc_cmds, 'command_invocation_context_dto')
    id_doc_cmds_scopes = make_id(f_doc_cmds, 'palette_command_scopes')
    nodes.extend([
        {"id": id_doc_cmds_doc, "label": "Spindle Command Palette Commands Doc", "file_type": "document", "source_file": f_doc_cmds, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_cmds_reg, "label": "spindle.commands.register API", "file_type": "code", "source_file": f_doc_cmds, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_cmds_ctx, "label": "Command Invocation Context DTO", "file_type": "code", "source_file": f_doc_cmds, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_cmds_scopes, "label": "Command Palette Scopes & Keybindings", "file_type": "concept", "source_file": f_doc_cmds, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_doc_cmds_doc, "target": id_doc_cmds_reg, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_cmds, "source_location": None, "weight": 1.0},
        {"source": id_doc_cmds_doc, "target": id_doc_cmds_ctx, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_cmds, "source_location": None, "weight": 1.0},
        {"source": id_doc_cmds_doc, "target": id_doc_cmds_scopes, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_cmds, "source_location": None, "weight": 1.0},
    ])

    # 19. developer-docs/docs/backend-api/context-handlers.md
    id_doc_ctx_doc = make_id(f_doc_ctx)
    id_doc_ctx_reg = make_id(f_doc_ctx, 'spindle_register_context_handler')
    id_doc_ctx_enrich = make_id(f_doc_ctx, 'generation_context_enricher')
    id_doc_ctx_cancel = make_id(f_doc_ctx, 'generation_cancellation_hook')
    nodes.extend([
        {"id": id_doc_ctx_doc, "label": "Spindle Context Handlers API Doc", "file_type": "document", "source_file": f_doc_ctx, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_ctx_reg, "label": "spindle.registerContextHandler API", "file_type": "code", "source_file": f_doc_ctx, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_ctx_enrich, "label": "Pre-Assembly Generation Context Enricher", "file_type": "concept", "source_file": f_doc_ctx, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_ctx_cancel, "label": "Generation Context Cancellation Hook", "file_type": "concept", "source_file": f_doc_ctx, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_doc_ctx_doc, "target": id_doc_ctx_reg, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_ctx, "source_location": None, "weight": 1.0},
        {"source": id_doc_ctx_doc, "target": id_doc_ctx_enrich, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_ctx, "source_location": None, "weight": 1.0},
        {"source": id_doc_ctx_doc, "target": id_doc_ctx_cancel, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_ctx, "source_location": None, "weight": 1.0},
        {"source": id_doc_ctx_enrich, "target": id_doc_mut_append, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_doc_ctx, "source_location": None, "weight": 1.0},
    ])

    # 20. developer-docs/docs/backend-api/cors-proxy.md
    id_doc_cors_doc = make_id(f_doc_cors)
    id_doc_cors_req = make_id(f_doc_cors, 'spindle_cors_request_api')
    id_doc_cors_priv = make_id(f_doc_cors, 'private_network_access_policy')
    nodes.extend([
        {"id": id_doc_cors_doc, "label": "Spindle CORS Proxy API Doc", "file_type": "document", "source_file": f_doc_cors, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_cors_req, "label": "spindle.cors HTTP Proxy API", "file_type": "code", "source_file": f_doc_cors, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_doc_cors_priv, "label": "Private Network Access Policy", "file_type": "rationale", "source_file": f_doc_cors, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_doc_cors_doc, "target": id_doc_cors_req, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_cors, "source_location": None, "weight": 1.0},
        {"source": id_doc_cors_doc, "target": id_doc_cors_priv, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_doc_cors, "source_location": None, "weight": 1.0},
        {"source": id_doc_cors_priv, "target": id_doc_cors_req, "relation": "rationale_for", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_doc_cors, "source_location": None, "weight": 1.0},
        {"source": id_doc_cors_priv, "target": id_us_spec_tm, "relation": "semantically_similar_to", "confidence": "INFERRED", "confidence_score": 0.75, "source_file": f_doc_cors, "source_location": None, "weight": 1.0},
    ])

    # Deep mode cross-document inferred edges
    edges.extend([
        {"source": id_doc_idx_perm, "target": id_doc_cors_doc, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_doc_idx, "source_location": None, "weight": 1.0},
        {"source": id_doc_idx_perm, "target": id_doc_chars_doc, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_doc_idx, "source_location": None, "weight": 1.0},
        {"source": id_doc_idx_perm, "target": id_doc_mut_doc, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_doc_idx, "source_location": None, "weight": 1.0},
        {"source": id_doc_idx_perm, "target": id_doc_chats_doc, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_doc_idx, "source_location": None, "weight": 1.0},
        {"source": id_doc_idx_perm, "target": id_doc_ctx_doc, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_doc_idx, "source_location": None, "weight": 1.0},
        {"source": id_doc_life_doc, "target": id_doc_be_proc_doc, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_doc_life, "source_location": None, "weight": 1.0},
        {"source": id_doc_rest_spindle, "target": id_doc_life_doc, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_doc_rest, "source_location": None, "weight": 1.0},
        {"source": id_grok_comp_t5, "target": id_doc_fe_proc_guard, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.75, "source_file": f_grok_comp, "source_location": None, "weight": 1.0},
    ])

    hyperedges = [
        {
            "id": "hyperedge_spindle_extension_core_lifecycle",
            "label": "Spindle Extension Core Lifecycle & Supervision Pipeline",
            "nodes": [id_doc_idx_framework, id_doc_life_install, id_doc_life_enable, id_doc_be_proc_sup],
            "relation": "participate_in",
            "confidence": "INFERRED",
            "confidence_score": 0.85,
            "source_file": f_doc_life
        },
        {
            "id": "hyperedge_chat_mutation_and_context_enrichment",
            "label": "Chat Mutation and Context Enrichment Data Flow",
            "nodes": [id_doc_chars_crud, id_doc_chats_crud, id_doc_mut_methods, id_doc_ctx_reg],
            "relation": "participate_in",
            "confidence": "INFERRED",
            "confidence_score": 0.95,
            "source_file": f_doc_mut
        },
        {
            "id": "hyperedge_userscript_zero_mod_integration",
            "label": "Userscript Zero-Core-Mod 1-Click Bridge Integration",
            "nodes": [id_us_spec_zero, id_us_spec_5tier, id_us_spec_3tier, id_us_plan_p1, id_us_spec_tm],
            "relation": "implement",
            "confidence": "EXTRACTED",
            "confidence_score": 1.0,
            "source_file": f_us_spec
        }
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "hyperedges": hyperedges,
        "input_tokens": 0,
        "output_tokens": 0
    }
