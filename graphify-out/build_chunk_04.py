import json
import re
from pathlib import Path

repo_root = Path(r"G:\AI\All lumiverse repos\Lumiverse")

FILES_CHUNK_04 = [
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\council.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\databanks.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\ephemeral-storage.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\event-tracking.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\events.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\frontend-communication.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\frontend-processes.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\generation.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\image-generation.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\images.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\index.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\interceptors.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\llm-tools.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\logging.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\macro-interceptor.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\macros.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\media.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\memories.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\message-content-processor.md",
    r"G:\AI\All lumiverse repos\Lumiverse\developer-docs\docs\backend-api\modal.md",
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

def build_chunk_04():
    nodes = []
    edges = []

    f_council = FILES_CHUNK_04[0]
    f_databanks = FILES_CHUNK_04[1]
    f_ephemeral = FILES_CHUNK_04[2]
    f_evtrack = FILES_CHUNK_04[3]
    f_events = FILES_CHUNK_04[4]
    f_fe_comm = FILES_CHUNK_04[5]
    f_fe_proc = FILES_CHUNK_04[6]
    f_gen = FILES_CHUNK_04[7]
    f_imggen = FILES_CHUNK_04[8]
    f_images = FILES_CHUNK_04[9]
    f_idx = FILES_CHUNK_04[10]
    f_inter = FILES_CHUNK_04[11]
    f_tools = FILES_CHUNK_04[12]
    f_log = FILES_CHUNK_04[13]
    f_macro_inter = FILES_CHUNK_04[14]
    f_macros = FILES_CHUNK_04[15]
    f_media = FILES_CHUNK_04[16]
    f_mem = FILES_CHUNK_04[17]
    f_mcp = FILES_CHUNK_04[18]
    f_modal = FILES_CHUNK_04[19]

    # 1. council.md
    id_council_doc = make_id(f_council)
    id_council_api = make_id(f_council, 'spindle_council_api_surface')
    id_council_settings = make_id(f_council, 'council_settings_schema')
    id_council_ctx = make_id(f_council, 'council_member_context')
    id_council_engine = make_id(f_council, 'multi_agent_deliberation_engine')
    nodes.extend([
        {"id": id_council_doc, "label": "Council Multi-Agent API Doc", "file_type": "document", "source_file": f_council, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_council_api, "label": "spindle.council API Surface", "file_type": "code", "source_file": f_council, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_council_settings, "label": "CouncilSettings Type Definition", "file_type": "code", "source_file": f_council, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_council_ctx, "label": "CouncilMemberContext Data Structure", "file_type": "code", "source_file": f_council, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_council_engine, "label": "Multi-Agent Deliberation Engine", "file_type": "concept", "source_file": f_council, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_council_doc, "target": id_council_api, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_council, "source_location": None, "weight": 1.0},
        {"source": id_council_doc, "target": id_council_settings, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_council, "source_location": None, "weight": 1.0},
        {"source": id_council_doc, "target": id_council_ctx, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_council, "source_location": None, "weight": 1.0},
        {"source": id_council_doc, "target": id_council_engine, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_council, "source_location": None, "weight": 1.0},
        {"source": id_council_api, "target": id_council_engine, "relation": "implements", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_council, "source_location": None, "weight": 1.0},
    ])

    # 2. databanks.md
    id_databanks_doc = make_id(f_databanks)
    id_databanks_api = make_id(f_databanks, 'spindle_databanks_api_surface')
    id_databanks_dto = make_id(f_databanks, 'databank_dto_schema')
    id_databanks_search = make_id(f_databanks, 'vector_semantic_search_retrieval')
    nodes.extend([
        {"id": id_databanks_doc, "label": "Databanks Vector Storage API Doc", "file_type": "document", "source_file": f_databanks, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_databanks_api, "label": "spindle.databanks API Surface", "file_type": "code", "source_file": f_databanks, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_databanks_dto, "label": "DatabankDTO Schema", "file_type": "code", "source_file": f_databanks, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_databanks_search, "label": "Vector Semantic Document Retrieval", "file_type": "concept", "source_file": f_databanks, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_databanks_doc, "target": id_databanks_api, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_databanks, "source_location": None, "weight": 1.0},
        {"source": id_databanks_doc, "target": id_databanks_dto, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_databanks, "source_location": None, "weight": 1.0},
        {"source": id_databanks_doc, "target": id_databanks_search, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_databanks, "source_location": None, "weight": 1.0},
        {"source": id_databanks_api, "target": id_databanks_dto, "relation": "shares_data_with", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_databanks, "source_location": None, "weight": 1.0},
    ])

    # 3. ephemeral-storage.md
    id_ephemeral_doc = make_id(f_ephemeral)
    id_ephemeral_api = make_id(f_ephemeral, 'spindle_ephemeral_api_surface')
    id_ephemeral_quota = make_id(f_ephemeral, 'ephemeral_quota_ttl_manager')
    nodes.extend([
        {"id": id_ephemeral_doc, "label": "Ephemeral Storage API Doc", "file_type": "document", "source_file": f_ephemeral, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_ephemeral_api, "label": "spindle.ephemeral API Surface", "file_type": "code", "source_file": f_ephemeral, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_ephemeral_quota, "label": "Ephemeral Memory Quota & TTL Manager", "file_type": "concept", "source_file": f_ephemeral, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_ephemeral_doc, "target": id_ephemeral_api, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_ephemeral, "source_location": None, "weight": 1.0},
        {"source": id_ephemeral_doc, "target": id_ephemeral_quota, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_ephemeral, "source_location": None, "weight": 1.0},
    ])

    # 4. event-tracking.md
    id_evtrack_doc = make_id(f_evtrack)
    id_evtrack_api = make_id(f_evtrack, 'spindle_event_tracking_api_surface')
    id_evtrack_filter = make_id(f_evtrack, 'tracked_event_replay_filter')
    nodes.extend([
        {"id": id_evtrack_doc, "label": "Event Tracking & Analytics API Doc", "file_type": "document", "source_file": f_evtrack, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_evtrack_api, "label": "spindle.eventTracking API Surface", "file_type": "code", "source_file": f_evtrack, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_evtrack_filter, "label": "TrackedEvent Schema & Replay Filter", "file_type": "code", "source_file": f_evtrack, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_evtrack_doc, "target": id_evtrack_api, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_evtrack, "source_location": None, "weight": 1.0},
        {"source": id_evtrack_doc, "target": id_evtrack_filter, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_evtrack, "source_location": None, "weight": 1.0},
    ])

    # 5. events.md
    id_events_doc = make_id(f_events)
    id_events_api = make_id(f_events, 'spindle_events_subscribe_api')
    id_events_chat = make_id(f_events, 'chat_lifecycle_events')
    id_events_gen = make_id(f_events, 'generation_lifecycle_events')
    id_events_swipe = make_id(f_events, 'swipe_interaction_events')
    nodes.extend([
        {"id": id_events_doc, "label": "Spindle Lifecycle Events Doc", "file_type": "document", "source_file": f_events, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_events_api, "label": "spindle.events.on Lifecycle Subscription", "file_type": "code", "source_file": f_events, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_events_chat, "label": "Chat Lifecycle Event Types", "file_type": "concept", "source_file": f_events, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_events_gen, "label": "Generation Lifecycle Event Types", "file_type": "concept", "source_file": f_events, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_events_swipe, "label": "Message Swipe & Edit Events", "file_type": "concept", "source_file": f_events, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_events_doc, "target": id_events_api, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_events, "source_location": None, "weight": 1.0},
        {"source": id_events_doc, "target": id_events_chat, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_events, "source_location": None, "weight": 1.0},
        {"source": id_events_doc, "target": id_events_gen, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_events, "source_location": None, "weight": 1.0},
        {"source": id_events_doc, "target": id_events_swipe, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_events, "source_location": None, "weight": 1.0},
    ])

    # 6. frontend-communication.md
    id_fe_comm_doc = make_id(f_fe_comm)
    id_fe_comm_api = make_id(f_fe_comm, 'spindle_postmessage_api')
    id_fe_comm_bridge = make_id(f_fe_comm, 'bidirectional_bridge_protocol')
    nodes.extend([
        {"id": id_fe_comm_doc, "label": "Backend-to-Frontend Communication Doc", "file_type": "document", "source_file": f_fe_comm, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_fe_comm_api, "label": "spindle.postMessage / onMessage RPC Channel", "file_type": "code", "source_file": f_fe_comm, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_fe_comm_bridge, "label": "Backend-Frontend Bidirectional Bridge Protocol", "file_type": "concept", "source_file": f_fe_comm, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_fe_comm_doc, "target": id_fe_comm_api, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_fe_comm, "source_location": None, "weight": 1.0},
        {"source": id_fe_comm_doc, "target": id_fe_comm_bridge, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_fe_comm, "source_location": None, "weight": 1.0},
        {"source": id_fe_comm_api, "target": id_fe_comm_bridge, "relation": "implements", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_fe_comm, "source_location": None, "weight": 1.0},
    ])

    # 7. frontend-processes.md
    id_fe_proc_doc = make_id(f_fe_proc)
    id_fe_proc_spawn = make_id(f_fe_proc, 'spindle_frontend_processes_spawn')
    id_fe_proc_sup = make_id(f_fe_proc, 'frontend_process_supervision_engine')
    nodes.extend([
        {"id": id_fe_proc_doc, "label": "Frontend Process Lifecycle API Doc", "file_type": "document", "source_file": f_fe_proc, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_fe_proc_spawn, "label": "spindle.frontendProcesses.spawn API", "file_type": "code", "source_file": f_fe_proc, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_fe_proc_sup, "label": "Frontend Process Supervision & Heartbeats", "file_type": "concept", "source_file": f_fe_proc, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_fe_proc_doc, "target": id_fe_proc_spawn, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_fe_proc, "source_location": None, "weight": 1.0},
        {"source": id_fe_proc_doc, "target": id_fe_proc_sup, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_fe_proc, "source_location": None, "weight": 1.0},
        {"source": id_fe_proc_spawn, "target": id_fe_comm_api, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_fe_proc, "source_location": None, "weight": 1.0},
    ])

    # 8. generation.md
    id_gen_doc = make_id(f_gen)
    id_gen_raw = make_id(f_gen, 'spindle_generate_raw_api')
    id_gen_quiet = make_id(f_gen, 'spindle_generate_quiet_api')
    id_gen_batch = make_id(f_gen, 'spindle_generate_batch_api')
    id_gen_dto = make_id(f_gen, 'generation_request_dto_schema')
    id_gen_toolcall = make_id(f_gen, 'tool_calling_assembly_protocol')
    id_gen_toolschema = make_id(f_gen, 'tool_schema_dto_definition')
    nodes.extend([
        {"id": id_gen_doc, "label": "Spindle LLM Generation API Doc", "file_type": "document", "source_file": f_gen, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_gen_raw, "label": "spindle.generate.raw API", "file_type": "code", "source_file": f_gen, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_gen_quiet, "label": "spindle.generate.quiet API", "file_type": "code", "source_file": f_gen, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_gen_batch, "label": "spindle.generate.batch API", "file_type": "code", "source_file": f_gen, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_gen_dto, "label": "GenerationRequestDTO Schema", "file_type": "code", "source_file": f_gen, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_gen_toolcall, "label": "LLM Tool Calling & Parts Protocol", "file_type": "concept", "source_file": f_gen, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_gen_toolschema, "label": "ToolSchemaDTO Definition", "file_type": "code", "source_file": f_gen, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_gen_doc, "target": id_gen_raw, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_gen, "source_location": None, "weight": 1.0},
        {"source": id_gen_doc, "target": id_gen_quiet, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_gen, "source_location": None, "weight": 1.0},
        {"source": id_gen_doc, "target": id_gen_batch, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_gen, "source_location": None, "weight": 1.0},
        {"source": id_gen_doc, "target": id_gen_dto, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_gen, "source_location": None, "weight": 1.0},
        {"source": id_gen_doc, "target": id_gen_toolcall, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_gen, "source_location": None, "weight": 1.0},
        {"source": id_gen_doc, "target": id_gen_toolschema, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_gen, "source_location": None, "weight": 1.0},
        {"source": id_gen_raw, "target": id_gen_dto, "relation": "shares_data_with", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_gen, "source_location": None, "weight": 1.0},
        {"source": id_gen_toolcall, "target": id_gen_toolschema, "relation": "shares_data_with", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_gen, "source_location": None, "weight": 1.0},
    ])

    # 9. image-generation.md
    id_imggen_doc = make_id(f_imggen)
    id_imggen_gen = make_id(f_imggen, 'spindle_image_gen_generate')
    id_imggen_stream = make_id(f_imggen, 'spindle_image_gen_stream')
    id_imggen_dto = make_id(f_imggen, 'image_gen_request_dto')
    id_imggen_backends = make_id(f_imggen, 'image_gen_provider_backends')
    nodes.extend([
        {"id": id_imggen_doc, "label": "Spindle Image Generation API Doc", "file_type": "document", "source_file": f_imggen, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_imggen_gen, "label": "spindle.imageGen.generate API", "file_type": "code", "source_file": f_imggen, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_imggen_stream, "label": "spindle.imageGen.generateStream API", "file_type": "code", "source_file": f_imggen, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_imggen_dto, "label": "ImageGenRequestDTO Schema", "file_type": "code", "source_file": f_imggen, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_imggen_backends, "label": "Multi-Backend Image Synthesis Adapters", "file_type": "concept", "source_file": f_imggen, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_imggen_doc, "target": id_imggen_gen, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_imggen, "source_location": None, "weight": 1.0},
        {"source": id_imggen_doc, "target": id_imggen_stream, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_imggen, "source_location": None, "weight": 1.0},
        {"source": id_imggen_doc, "target": id_imggen_dto, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_imggen, "source_location": None, "weight": 1.0},
        {"source": id_imggen_doc, "target": id_imggen_backends, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_imggen, "source_location": None, "weight": 1.0},
        {"source": id_imggen_gen, "target": id_imggen_dto, "relation": "shares_data_with", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_imggen, "source_location": None, "weight": 1.0},
    ])

    # 10. images.md
    id_images_doc = make_id(f_images)
    id_images_crud = make_id(f_images, 'spindle_images_crud_api')
    id_images_dto = make_id(f_images, 'image_dto_schema')
    id_images_dataurl = make_id(f_images, 'image_upload_data_url_helper')
    nodes.extend([
        {"id": id_images_doc, "label": "Spindle Image Asset Management Doc", "file_type": "document", "source_file": f_images, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_images_crud, "label": "spindle.images CRUD API", "file_type": "code", "source_file": f_images, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_images_dto, "label": "ImageDTO Data Transfer Object", "file_type": "code", "source_file": f_images, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_images_dataurl, "label": "Image Upload from Data URL Helper", "file_type": "code", "source_file": f_images, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_images_doc, "target": id_images_crud, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_images, "source_location": None, "weight": 1.0},
        {"source": id_images_doc, "target": id_images_dto, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_images, "source_location": None, "weight": 1.0},
        {"source": id_images_doc, "target": id_images_dataurl, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_images, "source_location": None, "weight": 1.0},
        {"source": id_images_crud, "target": id_images_dto, "relation": "shares_data_with", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_images, "source_location": None, "weight": 1.0},
        {"source": id_imggen_doc, "target": id_images_doc, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_images, "source_location": None, "weight": 1.0},
    ])

    # 11. index.md
    id_idx_doc = make_id(f_idx)
    id_idx_env = make_id(f_idx, 'spindle_global_environment')
    id_idx_types = make_id(f_idx, 'lumiverse_spindle_types_declaration')
    id_idx_perms = make_id(f_idx, 'permission_matrix_overview')
    nodes.extend([
        {"id": id_idx_doc, "label": "Backend API Surface Overview Doc", "file_type": "document", "source_file": f_idx, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_idx_env, "label": "Spindle Global Execution Environment", "file_type": "concept", "source_file": f_idx, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_idx_types, "label": "SpindleAPI Type Declaration Contract", "file_type": "code", "source_file": f_idx, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_idx_perms, "label": "Backend Permission Matrix Overview", "file_type": "concept", "source_file": f_idx, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_idx_doc, "target": id_idx_env, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_idx, "source_location": None, "weight": 1.0},
        {"source": id_idx_doc, "target": id_idx_types, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_idx, "source_location": None, "weight": 1.0},
        {"source": id_idx_doc, "target": id_idx_perms, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_idx, "source_location": None, "weight": 1.0},
        {"source": id_idx_env, "target": id_idx_types, "relation": "implements", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_idx, "source_location": None, "weight": 1.0},
    ])

    # 12. interceptors.md
    id_inter_doc = make_id(f_inter)
    id_inter_api = make_id(f_inter, 'spindle_register_interceptor_api')
    id_inter_dto = make_id(f_inter, 'interceptor_result_dto_schema')
    id_inter_prompt = make_id(f_inter, 'prompt_breakdown_visualizer_tagging')
    nodes.extend([
        {"id": id_inter_doc, "label": "Spindle Message Interceptors Doc", "file_type": "document", "source_file": f_inter, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_inter_api, "label": "spindle.registerInterceptor API", "file_type": "code", "source_file": f_inter, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_inter_dto, "label": "InterceptorResultDTO & Param Injection", "file_type": "code", "source_file": f_inter, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_inter_prompt, "label": "Prompt Breakdown Visualizer Tagging", "file_type": "concept", "source_file": f_inter, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_inter_doc, "target": id_inter_api, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_inter, "source_location": None, "weight": 1.0},
        {"source": id_inter_doc, "target": id_inter_dto, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_inter, "source_location": None, "weight": 1.0},
        {"source": id_inter_doc, "target": id_inter_prompt, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_inter, "source_location": None, "weight": 1.0},
        {"source": id_inter_api, "target": id_gen_raw, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_inter, "source_location": None, "weight": 1.0},
    ])

    # 13. llm-tools.md
    id_tools_doc = make_id(f_tools)
    id_tools_api = make_id(f_tools, 'spindle_register_tool_api')
    id_tools_dto = make_id(f_tools, 'tool_registration_dto_schema')
    id_tools_council = make_id(f_tools, 'council_tool_assignment_bridge')
    nodes.extend([
        {"id": id_tools_doc, "label": "Spindle LLM Tools API Doc", "file_type": "document", "source_file": f_tools, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_tools_api, "label": "spindle.registerTool API", "file_type": "code", "source_file": f_tools, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_tools_dto, "label": "ToolRegistrationDTO Schema", "file_type": "code", "source_file": f_tools, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_tools_council, "label": "Council Member Tool Assignment Bridge", "file_type": "concept", "source_file": f_tools, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_tools_doc, "target": id_tools_api, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_tools, "source_location": None, "weight": 1.0},
        {"source": id_tools_doc, "target": id_tools_dto, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_tools, "source_location": None, "weight": 1.0},
        {"source": id_tools_doc, "target": id_tools_council, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_tools, "source_location": None, "weight": 1.0},
        {"source": id_tools_api, "target": id_gen_toolcall, "relation": "shares_data_with", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_tools, "source_location": None, "weight": 1.0},
        {"source": id_tools_council, "target": id_council_api, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_tools, "source_location": None, "weight": 1.0},
    ])

    # 14. logging.md
    id_log_doc = make_id(f_log)
    id_log_api = make_id(f_log, 'spindle_log_levels_api')
    nodes.extend([
        {"id": id_log_doc, "label": "Spindle Server Console Logging Doc", "file_type": "document", "source_file": f_log, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_log_api, "label": "spindle.log Levels (info, warn, error)", "file_type": "code", "source_file": f_log, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_log_doc, "target": id_log_api, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_log, "source_location": None, "weight": 1.0},
    ])

    # 15. macro-interceptor.md
    id_macro_inter_doc = make_id(f_macro_inter)
    id_macro_inter_api = make_id(f_macro_inter, 'spindle_register_macro_interceptor')
    id_macro_inter_opt = make_id(f_macro_inter, 'fixed_point_macro_optimizer')
    nodes.extend([
        {"id": id_macro_inter_doc, "label": "Spindle Macro Interceptor Doc", "file_type": "document", "source_file": f_macro_inter, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_macro_inter_api, "label": "spindle.registerMacroInterceptor API", "file_type": "code", "source_file": f_macro_inter, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_macro_inter_opt, "label": "Fixed-Point Iteration Macro Optimizer", "file_type": "rationale", "source_file": f_macro_inter, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_macro_inter_doc, "target": id_macro_inter_api, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_macro_inter, "source_location": None, "weight": 1.0},
        {"source": id_macro_inter_doc, "target": id_macro_inter_opt, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_macro_inter, "source_location": None, "weight": 1.0},
        {"source": id_macro_inter_opt, "target": id_macro_inter_api, "relation": "rationale_for", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_macro_inter, "source_location": None, "weight": 1.0},
    ])

    # 16. macros.md
    id_macros_doc = make_id(f_macros)
    id_macros_reg = make_id(f_macros, 'spindle_register_macro_api')
    id_macros_dto = make_id(f_macros, 'macro_definition_dto_schema')
    id_macros_control = make_id(f_macros, 'macro_control_flow_engine')
    id_macros_protect = make_id(f_macros, 'macro_ownership_protection')
    nodes.extend([
        {"id": id_macros_doc, "label": "Spindle Macros Guide Doc", "file_type": "document", "source_file": f_macros, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_macros_reg, "label": "spindle.registerMacro API (Push & Pull)", "file_type": "code", "source_file": f_macros, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_macros_dto, "label": "MacroDefinitionDTO Schema", "file_type": "code", "source_file": f_macros, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_macros_control, "label": "Macro Scoped Control Flow Engine", "file_type": "concept", "source_file": f_macros, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_macros_protect, "label": "Macro Registration Ownership Protection", "file_type": "rationale", "source_file": f_macros, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_macros_doc, "target": id_macros_reg, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_macros, "source_location": None, "weight": 1.0},
        {"source": id_macros_doc, "target": id_macros_dto, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_macros, "source_location": None, "weight": 1.0},
        {"source": id_macros_doc, "target": id_macros_control, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_macros, "source_location": None, "weight": 1.0},
        {"source": id_macros_doc, "target": id_macros_protect, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_macros, "source_location": None, "weight": 1.0},
        {"source": id_macros_protect, "target": id_macros_reg, "relation": "rationale_for", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_macros, "source_location": None, "weight": 1.0},
        {"source": id_macro_inter_doc, "target": id_macros_doc, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_macros, "source_location": None, "weight": 1.0},
    ])

    # 17. media.md
    id_media_doc = make_id(f_media)
    id_media_api = make_id(f_media, 'spindle_media_transcoding_api')
    id_media_codecs = make_id(f_media, 'audio_video_codec_converters')
    id_media_still = make_id(f_media, 'still_image_video_composer')
    nodes.extend([
        {"id": id_media_doc, "label": "Spindle Media Processing API Doc", "file_type": "document", "source_file": f_media, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_media_api, "label": "spindle.media FFmpeg Processing API", "file_type": "code", "source_file": f_media, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_media_codecs, "label": "Audio & Video Codec Converters", "file_type": "concept", "source_file": f_media, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_media_still, "label": "Still-Image Video Clip Composer", "file_type": "concept", "source_file": f_media, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_media_doc, "target": id_media_api, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_media, "source_location": None, "weight": 1.0},
        {"source": id_media_doc, "target": id_media_codecs, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_media, "source_location": None, "weight": 1.0},
        {"source": id_media_doc, "target": id_media_still, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_media, "source_location": None, "weight": 1.0},
    ])

    # 18. memories.md
    id_mem_doc = make_id(f_mem)
    id_mem_cortex = make_id(f_mem, 'memory_cortex_entity_graph')
    id_mem_fusion = make_id(f_mem, 'cortex_retrieval_fusion_engine')
    id_mem_dto = make_id(f_mem, 'cortex_result_dto_schema')
    id_mem_vector = make_id(f_mem, 'long_term_vector_chunk_store')
    nodes.extend([
        {"id": id_mem_doc, "label": "Spindle Hybrid Memories API Doc", "file_type": "document", "source_file": f_mem, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_mem_cortex, "label": "Memory Cortex Entity & Relation Graph", "file_type": "concept", "source_file": f_mem, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_mem_fusion, "label": "Cortex Ranked Retrieval Fusion Engine", "file_type": "concept", "source_file": f_mem, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_mem_dto, "label": "CortexResultDTO Data Transfer Object", "file_type": "code", "source_file": f_mem, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_mem_vector, "label": "Long-Term Vectorized Chat Chunk Store", "file_type": "concept", "source_file": f_mem, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_mem_doc, "target": id_mem_cortex, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_mem, "source_location": None, "weight": 1.0},
        {"source": id_mem_doc, "target": id_mem_fusion, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_mem, "source_location": None, "weight": 1.0},
        {"source": id_mem_doc, "target": id_mem_dto, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_mem, "source_location": None, "weight": 1.0},
        {"source": id_mem_doc, "target": id_mem_vector, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_mem, "source_location": None, "weight": 1.0},
        {"source": id_mem_cortex, "target": id_mem_fusion, "relation": "shares_data_with", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_mem, "source_location": None, "weight": 1.0},
        {"source": id_mem_fusion, "target": id_mem_dto, "relation": "shares_data_with", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_mem, "source_location": None, "weight": 1.0},
    ])

    # 19. message-content-processor.md
    id_mcp_doc = make_id(f_mcp)
    id_mcp_api = make_id(f_mcp, 'spindle_register_mcp_api')
    id_mcp_predb = make_id(f_mcp, 'pre_db_write_content_transform')
    nodes.extend([
        {"id": id_mcp_doc, "label": "Spindle Message Content Processor Doc", "file_type": "document", "source_file": f_mcp, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_mcp_api, "label": "spindle.registerMessageContentProcessor API", "file_type": "code", "source_file": f_mcp, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_mcp_predb, "label": "Pre-DB Write Message Content Transformation", "file_type": "concept", "source_file": f_mcp, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_mcp_doc, "target": id_mcp_api, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_mcp, "source_location": None, "weight": 1.0},
        {"source": id_mcp_doc, "target": id_mcp_predb, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_mcp, "source_location": None, "weight": 1.0},
        {"source": id_mcp_predb, "target": id_inter_api, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_mcp, "source_location": None, "weight": 1.0},
    ])

    # 20. modal.md
    id_modal_doc = make_id(f_modal)
    id_modal_api = make_id(f_modal, 'spindle_modal_open_api')
    id_modal_items = make_id(f_modal, 'modal_content_items_schema')
    id_modal_life = make_id(f_modal, 'blocking_dialog_lifecycle')
    nodes.extend([
        {"id": id_modal_doc, "label": "Spindle Backend Modal UI API Doc", "file_type": "document", "source_file": f_modal, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_modal_api, "label": "spindle.modal.open API", "file_type": "code", "source_file": f_modal, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_modal_items, "label": "Modal Content Items Schema & Form Controls", "file_type": "code", "source_file": f_modal, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
        {"id": id_modal_life, "label": "Blocking Modal Overlay Lifecycle", "file_type": "concept", "source_file": f_modal, "source_location": None, "source_url": None, "captured_at": None, "author": None, "contributor": None},
    ])
    edges.extend([
        {"source": id_modal_doc, "target": id_modal_api, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_modal, "source_location": None, "weight": 1.0},
        {"source": id_modal_doc, "target": id_modal_items, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_modal, "source_location": None, "weight": 1.0},
        {"source": id_modal_doc, "target": id_modal_life, "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": f_modal, "source_location": None, "weight": 1.0},
        {"source": id_modal_api, "target": id_fe_comm_api, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_modal, "source_location": None, "weight": 1.0},
    ])

    # Deep mode cross-document inferred edges
    edges.extend([
        {"source": id_idx_perms, "target": id_gen_doc, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_idx, "source_location": None, "weight": 1.0},
        {"source": id_idx_perms, "target": id_imggen_doc, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_idx, "source_location": None, "weight": 1.0},
        {"source": id_idx_perms, "target": id_databanks_doc, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_idx, "source_location": None, "weight": 1.0},
        {"source": id_idx_perms, "target": id_mem_doc, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_idx, "source_location": None, "weight": 1.0},
        {"source": id_gen_raw, "target": id_inter_api, "relation": "shares_data_with", "confidence": "INFERRED", "confidence_score": 0.95, "source_file": f_gen, "source_location": None, "weight": 1.0},
        {"source": id_mem_vector, "target": id_macros_reg, "relation": "conceptually_related_to", "confidence": "INFERRED", "confidence_score": 0.85, "source_file": f_mem, "source_location": None, "weight": 1.0},
    ])

    hyperedges = [
        {
            "id": "hyperedge_generation_prompt_pipeline",
            "label": "Prompt Interception & LLM Generation Pipeline",
            "nodes": [id_gen_raw, id_inter_api, id_macro_inter_api, id_tools_api],
            "relation": "participate_in",
            "confidence": "INFERRED",
            "confidence_score": 0.95,
            "source_file": f_gen
        },
        {
            "id": "hyperedge_council_multiagent_orchestration",
            "label": "Council Multi-Agent Deliberation & Tool Execution",
            "nodes": [id_council_api, id_council_settings, id_tools_council, id_gen_raw],
            "relation": "participate_in",
            "confidence": "INFERRED",
            "confidence_score": 0.95,
            "source_file": f_council
        },
        {
            "id": "hyperedge_hybrid_memory_cortex_and_vector",
            "label": "Memory Cortex & Long-Term Retrieval Storage",
            "nodes": [id_mem_cortex, id_mem_fusion, id_mem_vector, id_databanks_search],
            "relation": "participate_in",
            "confidence": "INFERRED",
            "confidence_score": 0.85,
            "source_file": f_mem
        }
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "hyperedges": hyperedges,
        "input_tokens": 0,
        "output_tokens": 0
    }
