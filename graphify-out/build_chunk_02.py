import os
import sys
import json
import re

repo_root = r'G:\AI\All lumiverse repos\Lumiverse'

chunk2_files = [
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_extensibility_ui_modernization_20260816\spec.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_extensibility_ui_modernization_20260816\handoff\grok-implementation-handoff.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_extensibility_ui_modernization_20260816\handoff\plan-rewrite-retrospective-and-agent-instruction-amendments.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_extensibility_ui_modernization_20260816\handoff\ui-bugfix-session-handoff-20260817.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_extensibility_ui_modernization_20260816\review\evidence-ledger.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\index.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\plan.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\spec.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\builder-handoff.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\BUILDER_PACKET.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\BUILDER_PACKET_2.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\grok-handoff.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\phase1-summary.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\phase2-summary.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\phase3-summary.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\phaseA-summary.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\phaseB-summary.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_toolbar_dock_composer_20260817\index.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_toolbar_dock_composer_20260817\handoff\followup-grok-handoff.md",
    r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_toolbar_dock_composer_20260817\handoff\grok-handoff.md"
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

def build_chunk_02():
    nodes = []
    edges = []
    hyperedges = []

    # 1. spindle_extensibility_ui_modernization_20260816/spec.md
    f_sp_spec = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_extensibility_ui_modernization_20260816\spec.md"
    n_sp_spec_doc = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_spec_doc", "Spindle Extensibility V2 Specification", "document", f_sp_spec)
    n_sp_spec_types = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_spec_types_runtime", "Spindle Types & Runtime Extensibility", "concept", f_sp_spec)
    n_sp_spec_toolbar = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_spec_toolbar_docking", "Toolbar Overhaul and Docking Systems", "concept", f_sp_spec)
    n_sp_spec_picker = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_spec_connection_picker_parity", "Universal Connection Picker Parity", "concept", f_sp_spec)
    n_sp_spec_ac = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_spec_acceptance_criteria", "Spindle Modernization Acceptance Criteria", "concept", f_sp_spec)
    nodes.extend([n_sp_spec_doc, n_sp_spec_types, n_sp_spec_toolbar, n_sp_spec_picker, n_sp_spec_ac])
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_spec_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_spec_types_runtime", "references", "EXTRACTED", 1.0, f_sp_spec))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_spec_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_spec_toolbar_docking", "references", "EXTRACTED", 1.0, f_sp_spec))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_spec_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_spec_connection_picker_parity", "references", "EXTRACTED", 1.0, f_sp_spec))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_spec_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_spec_acceptance_criteria", "references", "EXTRACTED", 1.0, f_sp_spec))

    # 2. handoff/grok-implementation-handoff.md
    f_grok_impl = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_extensibility_ui_modernization_20260816\handoff\grok-implementation-handoff.md"
    n_grok_impl_doc = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_grok_implementation_handoff_doc", "Grok Implementation Handoff Document", "document", f_grok_impl)
    n_grok_impl_mission = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_grok_implementation_handoff_mission", "Spindle Extensibility Implementation Mission", "concept", f_grok_impl)
    n_grok_impl_worktree = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_grok_implementation_handoff_worktree_protection", "Worktree Protection and Non-Negotiable Invariants", "concept", f_grok_impl, rationale="Preserve worktree changes from other active tracks; execute isolated, verifiable task units.")
    n_grok_impl_seq = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_grok_implementation_handoff_execution_sequence", "Implementation Task Execution Sequence", "concept", f_grok_impl)
    nodes.extend([n_grok_impl_doc, n_grok_impl_mission, n_grok_impl_worktree, n_grok_impl_seq])
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_grok_implementation_handoff_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_grok_implementation_handoff_mission", "references", "EXTRACTED", 1.0, f_grok_impl))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_grok_implementation_handoff_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_grok_implementation_handoff_worktree_protection", "references", "EXTRACTED", 1.0, f_grok_impl))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_grok_implementation_handoff_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_grok_implementation_handoff_execution_sequence", "references", "EXTRACTED", 1.0, f_grok_impl))

    # 3. handoff/plan-rewrite-retrospective-and-agent-instruction-amendments.md
    f_retro = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_extensibility_ui_modernization_20260816\handoff\plan-rewrite-retrospective-and-agent-instruction-amendments.md"
    n_retro_doc = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_plan_rewrite_retrospective_doc", "Plan Rewrite Retrospective & Agent Instruction Amendments", "document", f_retro)
    n_retro_accounting = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_plan_rewrite_retrospective_accounting", "25 Plan Rewrite Passes and Canonical Accounting", "concept", f_retro)
    n_retro_amendments = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_plan_rewrite_retrospective_agent_amendments", "Agent Instruction Amendments for Strict Evidence Contracts", "concept", f_retro, rationale="Bind planning agents to single-source evidence ledgers and prohibit unbound speculative edits.")
    nodes.extend([n_retro_doc, n_retro_accounting, n_retro_amendments])
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_plan_rewrite_retrospective_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_plan_rewrite_retrospective_accounting", "references", "EXTRACTED", 1.0, f_retro))
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_plan_rewrite_retrospective_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_plan_rewrite_retrospective_agent_amendments", "references", "EXTRACTED", 1.0, f_retro))

    # 4. handoff/ui-bugfix-session-handoff-20260817.md
    f_ui_bug_ho = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_extensibility_ui_modernization_20260816\handoff\ui-bugfix-session-handoff-20260817.md"
    n_ui_bug_ho_doc = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_ui_bugfix_session_handoff_20260817_doc", "UI Bugfix Session Handoff (2026-08-17)", "document", f_ui_bug_ho)
    n_ui_bug_ho_broken = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_ui_bugfix_session_handoff_20260817_broken_items", "Persistent Broken Items in Connection Pickers and Floating Toolbar", "concept", f_ui_bug_ho)
    nodes.extend([n_ui_bug_ho_doc, n_ui_bug_ho_broken])
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_ui_bugfix_session_handoff_20260817_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_ui_bugfix_session_handoff_20260817_broken_items", "references", "EXTRACTED", 1.0, f_ui_bug_ho))

    # 5. review/evidence-ledger.md
    f_ev_ledger = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_extensibility_ui_modernization_20260816\review\evidence-ledger.md"
    n_ev_ledger_doc = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_review_evidence_ledger_doc", "Track Evidence Ledger", "document", f_ev_ledger)
    n_ev_ledger_resolutions = make_node("conductor_tracks_spindle_extensibility_ui_modernization_20260816_review_evidence_ledger_resolutions", "Critique Findings and Resolution Verification Targets", "concept", f_ev_ledger)
    nodes.extend([n_ev_ledger_doc, n_ev_ledger_resolutions])
    edges.append(make_edge("conductor_tracks_spindle_extensibility_ui_modernization_20260816_review_evidence_ledger_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_review_evidence_ledger_resolutions", "references", "EXTRACTED", 1.0, f_ev_ledger))

    # 6. spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817/index.md
    f_bug_idx = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\index.md"
    n_bug_idx_doc = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_index_doc", "Bugfix Track Manifest: Connection Picker Parity and Toolbar Auto-Fit", "document", f_bug_idx)
    nodes.append(n_bug_idx_doc)

    # 7. spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817/plan.md
    f_bug_plan = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\plan.md"
    n_bug_plan_doc = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_doc", "Bugfix Implementation Plan: Picker Parity & Toolbar Auto-Fit", "document", f_bug_plan)
    n_bug_plan_p1 = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_p1_picker", "Phase 1: Shared Sidecar Connection Picker & Settings Parity (TDD)", "concept", f_bug_plan)
    n_bug_plan_p2 = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_p2_toolbar", "Phase 2: Quick Toolbar Floating V2 Auto-Fit Sizing (TDD)", "concept", f_bug_plan)
    n_bug_plan_p3 = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_p3_edit_send", "Phase 3: Direct In-Place Edit-and-Send (Save + Swipe) (TDD)", "concept", f_bug_plan)
    n_bug_plan_p4 = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_p4_build", "Phase 4: Full Build, Typecheck, and Delivery Checkpoint", "concept", f_bug_plan)
    nodes.extend([n_bug_plan_doc, n_bug_plan_p1, n_bug_plan_p2, n_bug_plan_p3, n_bug_plan_p4])
    edges.append(make_edge("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_doc", "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_p1_picker", "references", "EXTRACTED", 1.0, f_bug_plan))
    edges.append(make_edge("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_doc", "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_p2_toolbar", "references", "EXTRACTED", 1.0, f_bug_plan))
    edges.append(make_edge("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_doc", "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_p3_edit_send", "references", "EXTRACTED", 1.0, f_bug_plan))
    edges.append(make_edge("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_doc", "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_p4_build", "references", "EXTRACTED", 1.0, f_bug_plan))
    edges.append(make_edge("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_index_doc", "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_doc", "references", "EXTRACTED", 1.0, f_bug_idx))

    # 8. spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817/spec.md
    f_bug_spec = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\spec.md"
    n_bug_spec_doc = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_spec_doc", "Bugfix Track Specification: Picker Parity & Toolbar Auto-Fit", "document", f_bug_spec)
    n_bug_spec_reqs = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_spec_functional_reqs", "Bugfix Functional Requirements & Acceptance Criteria", "concept", f_bug_spec)
    nodes.extend([n_bug_spec_doc, n_bug_spec_reqs])
    edges.append(make_edge("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_spec_doc", "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_spec_functional_reqs", "references", "EXTRACTED", 1.0, f_bug_spec))
    edges.append(make_edge("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_doc", "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_spec_doc", "implements", "EXTRACTED", 1.0, f_bug_plan))

    # 9. spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817/handoff/builder-handoff.md
    f_bug_b_ho = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\builder-handoff.md"
    n_bug_b_ho_doc = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_builder_handoff_doc", "Bugfix Builder Handoff Instruction", "document", f_bug_b_ho)
    nodes.append(n_bug_b_ho_doc)

    # 10. spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817/handoff/BUILDER_PACKET.md
    f_bug_bp = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\BUILDER_PACKET.md"
    n_bug_bp_doc = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_builder_packet_doc", "Bugfix Track Builder Packet", "document", f_bug_bp)
    n_bug_bp_constraints = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_builder_packet_constraints", "Hard Constraints & Golden Token Visuals", "concept", f_bug_bp, rationale="Copy design system tokens, preserve exact layer hierarchies, and prevent layout regressions.")
    nodes.extend([n_bug_bp_doc, n_bug_bp_constraints])
    edges.append(make_edge("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_builder_packet_doc", "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_builder_packet_constraints", "references", "EXTRACTED", 1.0, f_bug_bp))

    # 11. spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817/handoff/BUILDER_PACKET_2.md
    f_bug_bp2 = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\BUILDER_PACKET_2.md"
    n_bug_bp2_doc = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_builder_packet_2_doc", "Builder Packet 2: Embeddings & Toolbar Remount Fixes", "document", f_bug_bp2)
    nodes.append(n_bug_bp2_doc)

    # 12. spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817/handoff/grok-handoff.md
    f_bug_grok_ho = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\grok-handoff.md"
    n_bug_grok_ho_doc = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_grok_handoff_doc", "Bugfix Grok Handoff Specification", "document", f_bug_grok_ho)
    nodes.append(n_bug_grok_ho_doc)
    edges.append(make_edge("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_grok_handoff_doc", "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_builder_handoff_doc", "semantically_similar_to", "EXTRACTED", 1.0, f_bug_grok_ho))

    # 13. spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817/handoff/phase1-summary.md
    f_p1_sum = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\phase1-summary.md"
    n_p1_sum_doc = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_phase1_summary_doc", "Phase 1 Summary: Sidecar Picker Parity", "document", f_p1_sum)
    nodes.append(n_p1_sum_doc)

    # 14. spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817/handoff/phase2-summary.md
    f_p2_sum = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\phase2-summary.md"
    n_p2_sum_doc = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_phase2_summary_doc", "Phase 2 Summary: Quick Toolbar Floating V2 Auto-Fit", "document", f_p2_sum)
    nodes.append(n_p2_sum_doc)

    # 15. spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817/handoff/phase3-summary.md
    f_p3_sum = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\phase3-summary.md"
    n_p3_sum_doc = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_phase3_summary_doc", "Phase 3 Summary: In-Place Edit and Send", "document", f_p3_sum)
    nodes.append(n_p3_sum_doc)

    # 16. spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817/handoff/phaseA-summary.md
    f_pa_sum = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\phaseA-summary.md"
    n_pa_sum_doc = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_phasea_summary_doc", "Phase A Summary: Embeddings Picker and Empty Trigger Icon", "document", f_pa_sum)
    nodes.append(n_pa_sum_doc)

    # 17. spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817/handoff/phaseB-summary.md
    f_pb_sum = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817\handoff\phaseB-summary.md"
    n_pb_sum_doc = make_node("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_phaseb_summary_doc", "Phase B Summary: Quick Toolbar Remount and Hug-All", "document", f_pb_sum)
    nodes.append(n_pb_sum_doc)

    # 18. spindle_ui_toolbar_dock_composer_20260817/index.md
    f_dock_idx = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_toolbar_dock_composer_20260817\index.md"
    n_dock_idx_doc = make_node("conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_index_doc", "Toolbar Dock and Composer Track Manifest", "document", f_dock_idx)
    nodes.append(n_dock_idx_doc)

    # 19. spindle_ui_toolbar_dock_composer_20260817/handoff/followup-grok-handoff.md
    f_dock_fup = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_toolbar_dock_composer_20260817\handoff\followup-grok-handoff.md"
    n_dock_fup_doc = make_node("conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_handoff_followup_grok_handoff_doc", "Follow-up Handoff: Toolbar & Composer DnD and Hold-Time", "document", f_dock_fup)
    n_dock_fup_dnd = make_node("conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_handoff_followup_grok_handoff_dnd_rules", "Drag-and-Drop 500ms Hold Time & Reordering Rules", "concept", f_dock_fup, rationale="Reduces drag activation hold time from 1000ms to 500ms for snappier composer and action bar reordering.")
    nodes.extend([n_dock_fup_doc, n_dock_fup_dnd])
    edges.append(make_edge("conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_handoff_followup_grok_handoff_doc", "conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_handoff_followup_grok_handoff_dnd_rules", "references", "EXTRACTED", 1.0, f_dock_fup))

    # 20. spindle_ui_toolbar_dock_composer_20260817/handoff/grok-handoff.md
    f_dock_gho = r"G:\AI\All lumiverse repos\Lumiverse\conductor\tracks\spindle_ui_toolbar_dock_composer_20260817\handoff\grok-handoff.md"
    n_dock_gho_doc = make_node("conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_handoff_grok_handoff_doc", "Toolbar Dock & Composer Builder Handoff", "document", f_dock_gho)
    n_dock_gho_rules = make_node("conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_handoff_grok_handoff_product_rules", "V2 Dock Collapse, Select Messages Action, and Floating Rail", "concept", f_dock_gho)
    nodes.extend([n_dock_gho_doc, n_dock_gho_rules])
    edges.append(make_edge("conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_handoff_grok_handoff_doc", "conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_handoff_grok_handoff_product_rules", "references", "EXTRACTED", 1.0, f_dock_gho))
    edges.append(make_edge("conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_index_doc", "conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_handoff_grok_handoff_doc", "references", "EXTRACTED", 1.0, f_dock_idx))
    edges.append(make_edge("conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_handoff_followup_grok_handoff_doc", "conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_handoff_grok_handoff_doc", "references", "EXTRACTED", 1.0, f_dock_fup))

    # Cross-track / Cross-file edges (DEEP_MODE=true)
    edges.append(make_edge("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_spec_doc", "implements", "INFERRED", 0.95, f_bug_plan))
    edges.append(make_edge("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_builder_packet_doc", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_ui_bugfix_session_handoff_20260817_broken_items", "implements", "INFERRED", 0.95, f_bug_bp))
    edges.append(make_edge("conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_handoff_grok_handoff_product_rules", "conductor_tracks_spindle_extensibility_ui_modernization_20260816_spec_toolbar_docking", "implements", "INFERRED", 0.95, f_dock_gho))
    edges.append(make_edge("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_phase1_summary_doc", "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_p1_picker", "implements", "EXTRACTED", 1.0, f_p1_sum))
    edges.append(make_edge("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_phase2_summary_doc", "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_p2_toolbar", "implements", "EXTRACTED", 1.0, f_p2_sum))
    edges.append(make_edge("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_phase3_summary_doc", "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_p3_edit_send", "implements", "EXTRACTED", 1.0, f_p3_sum))
    edges.append(make_edge("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_phasea_summary_doc", "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_builder_packet_2_doc", "implements", "EXTRACTED", 1.0, f_pa_sum))
    edges.append(make_edge("conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_phaseb_summary_doc", "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_builder_packet_2_doc", "implements", "EXTRACTED", 1.0, f_pb_sum))

    # Hyperedges
    hyperedges.append(make_hyperedge(
        "he_spindle_extensibility_handoff_and_review_suite",
        "Spindle Extensibility V2 Handoffs, Retrospective, and Evidence Ledger Suite",
        [
            "conductor_tracks_spindle_extensibility_ui_modernization_20260816_spec_doc",
            "conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_grok_implementation_handoff_doc",
            "conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_plan_rewrite_retrospective_doc",
            "conductor_tracks_spindle_extensibility_ui_modernization_20260816_handoff_ui_bugfix_session_handoff_20260817_doc",
            "conductor_tracks_spindle_extensibility_ui_modernization_20260816_review_evidence_ledger_doc"
        ],
        "form",
        "EXTRACTED",
        1.0,
        f_sp_spec
    ))

    hyperedges.append(make_hyperedge(
        "he_spindle_ui_bugfix_track_system",
        "Spindle UI Bugfix, Connection Picker Parity, and Toolbar Autofit Track System",
        [
            "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_index_doc",
            "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_plan_doc",
            "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_spec_doc",
            "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_builder_handoff_doc",
            "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_builder_packet_doc",
            "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_builder_packet_2_doc",
            "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_phase1_summary_doc",
            "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_phase2_summary_doc",
            "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_phase3_summary_doc",
            "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_phasea_summary_doc",
            "conductor_tracks_spindle_ui_bugfix_picker_parity_toolbar_autofit_20260817_handoff_phaseb_summary_doc"
        ],
        "implement",
        "EXTRACTED",
        1.0,
        f_bug_idx
    ))

    hyperedges.append(make_hyperedge(
        "he_spindle_toolbar_dock_composer_track",
        "Toolbar Dock Collapse, Message Selection, and Composer Reordering Track",
        [
            "conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_index_doc",
            "conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_handoff_grok_handoff_doc",
            "conductor_tracks_spindle_ui_toolbar_dock_composer_20260817_handoff_followup_grok_handoff_doc"
        ],
        "implement",
        "EXTRACTED",
        1.0,
        f_dock_idx
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
    c2 = build_chunk_02()
    out_path = os.path.join(repo_root, "graphify-out", ".graphify_chunk_02.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(c2, f, indent=2)
    print(f"Wrote Chunk 02 with {len(c2['nodes'])} nodes, {len(c2['edges'])} edges, {len(c2['hyperedges'])} hyperedges to {out_path}")
