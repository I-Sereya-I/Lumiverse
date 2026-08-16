import json
import sys
from pathlib import Path
from build_chunk_03 import build_chunk_03, FILES_CHUNK_03
from build_chunk_04 import build_chunk_04, FILES_CHUNK_04

def validate_chunk(data, file_list, name):
    import re
    node_ids = set()
    for n in data["nodes"]:
        nid = n["id"]
        assert re.match(r'^[a-z0-9_]+$', nid), f"[{name}] Invalid node id: {nid}"
        assert n["file_type"] in ["code", "document", "paper", "image", "rationale", "concept"], f"[{name}] Invalid file_type: {n['file_type']}"
        assert n["source_file"] in file_list, f"[{name}] Unknown source_file: {n['source_file']}"
        node_ids.add(nid)
    
    for e in data["edges"]:
        assert e["source"] in node_ids, f"[{name}] Edge source not in nodes: {e['source']}"
        assert e["target"] in node_ids, f"[{name}] Edge target not in nodes: {e['target']}"
        assert e["relation"] in [
            "implements", "references", "cites", "conceptually_related_to",
            "shares_data_with", "semantically_similar_to", "rationale_for", "calls"
        ], f"[{name}] Invalid relation: {e['relation']}"
        assert e["confidence"] in ["EXTRACTED", "INFERRED", "AMBIGUOUS"], f"[{name}] Invalid confidence: {e['confidence']}"
        if e["confidence"] == "EXTRACTED":
            assert e["confidence_score"] == 1.0, f"[{name}] EXTRACTED must have score 1.0: {e}"
        elif e["confidence"] == "INFERRED":
            assert e["confidence_score"] in [0.95, 0.85, 0.75, 0.65, 0.55], f"[{name}] INFERRED invalid score: {e['confidence_score']}"
        elif e["confidence"] == "AMBIGUOUS":
            assert 0.1 <= e["confidence_score"] <= 0.3, f"[{name}] AMBIGUOUS invalid score: {e['confidence_score']}"
        assert e["source_file"] in file_list, f"[{name}] Edge source_file invalid: {e['source_file']}"
        
    assert len(data["hyperedges"]) <= 3, f"[{name}] Too many hyperedges: {len(data['hyperedges'])}"
    for h in data["hyperedges"]:
        assert re.match(r'^[a-z0-9_]+$', h["id"]), f"[{name}] Invalid hyperedge id: {h['id']}"
        assert len(h["nodes"]) >= 3, f"[{name}] Hyperedge must have >= 3 nodes: {h['id']}"
        for hn in h["nodes"]:
            assert hn in node_ids, f"[{name}] Hyperedge node {hn} not in nodes"
        assert h["relation"] in ["participate_in", "implement", "form"], f"[{name}] Invalid hyperedge relation: {h['relation']}"
        assert h["source_file"] in file_list, f"[{name}] Hyperedge source_file invalid: {h['source_file']}"

    print(f"[{name}] Validation passed: {len(data['nodes'])} nodes, {len(data['edges'])} edges, {len(data['hyperedges'])} hyperedges.")

def main():
    out_03 = Path(r"G:\AI\All lumiverse repos\Lumiverse\graphify-out\.graphify_chunk_03.json")
    out_04 = Path(r"G:\AI\All lumiverse repos\Lumiverse\graphify-out\.graphify_chunk_04.json")

    data_03 = build_chunk_03()
    validate_chunk(data_03, FILES_CHUNK_03, "Chunk 03")
    out_03.write_text(json.dumps(data_03, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_03}")

    data_04 = build_chunk_04()
    validate_chunk(data_04, FILES_CHUNK_04, "Chunk 04")
    out_04.write_text(json.dumps(data_04, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_04}")

if __name__ == "__main__":
    main()
