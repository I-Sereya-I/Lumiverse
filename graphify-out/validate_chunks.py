import os
import sys
import json
import re

repo_root = r'G:\AI\All lumiverse repos\Lumiverse'
f1 = os.path.join(repo_root, 'graphify-out', '.graphify_chunk_01.json')
f2 = os.path.join(repo_root, 'graphify-out', '.graphify_chunk_02.json')

valid_file_types = {'code', 'document', 'paper', 'image', 'rationale', 'concept'}
valid_edge_relations = {'implements', 'references', 'cites', 'conceptually_related_to', 'shares_data_with', 'semantically_similar_to', 'rationale_for'}
valid_confidences = {'EXTRACTED', 'INFERRED', 'AMBIGUOUS'}
valid_hyper_relations = {'participate_in', 'implement', 'form'}
valid_hyper_confidences = {'EXTRACTED', 'INFERRED'}

id_pattern = re.compile(r'^[a-z0-9_]+$')

def validate_chunk(path, name):
    print(f'Validating {name}: {path}')
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for k in ['nodes', 'edges', 'hyperedges', 'input_tokens', 'output_tokens']:
        assert k in data, f'Missing root key {k}'
    
    node_ids = set()
    for i, n in enumerate(data['nodes']):
        nid = n.get('id', '')
        assert id_pattern.match(nid), f'Invalid node id: {nid}'
        ft = n.get('file_type')
        assert ft in valid_file_types, f'Invalid file_type in node {nid}: {ft}'
        assert os.path.isabs(n.get('source_file', '')), f'source_file not absolute in node {nid}'
        node_ids.add(nid)
    
    for i, e in enumerate(data['edges']):
        src = e.get('source', '')
        tgt = e.get('target', '')
        assert id_pattern.match(src), f'Invalid edge source id: {src}'
        assert id_pattern.match(tgt), f'Invalid edge target id: {tgt}'
        rel = e.get('relation')
        assert rel in valid_edge_relations, f'Invalid edge relation: {rel}'
        conf = e.get('confidence')
        assert conf in valid_confidences, f'Invalid edge confidence: {conf}'
        assert isinstance(e.get('confidence_score'), (int, float)), f'Missing or invalid confidence_score in edge'
        assert os.path.isabs(e.get('source_file', '')), f'source_file not absolute in edge'
        assert isinstance(e.get('weight'), (int, float)), f'weight not numeric in edge'
    
    for i, h in enumerate(data['hyperedges']):
        hid = h.get('id', '')
        assert id_pattern.match(hid), f'Invalid hyperedge id: {hid}'
        hrel = h.get('relation')
        assert hrel in valid_hyper_relations, f'Invalid hyperedge relation: {hrel}'
        hconf = h.get('confidence')
        assert hconf in valid_hyper_confidences, f'Invalid hyperedge confidence: {hconf}'
        assert isinstance(h.get('confidence_score'), (int, float)), f'confidence_score not numeric in hyperedge'
        assert isinstance(h.get('nodes'), list), f'nodes not list in hyperedge'
        for member in h['nodes']:
            assert id_pattern.match(member), f'Invalid hyperedge member id: {member}'
        assert os.path.isabs(h.get('source_file', '')), f'source_file not absolute in hyperedge'

    print(f'PASS: {name} validated successfully with {len(data["nodes"])} nodes, {len(data["edges"])} edges, {len(data["hyperedges"])} hyperedges.')

if __name__ == '__main__':
    validate_chunk(f1, 'Chunk 01')
    validate_chunk(f2, 'Chunk 02')
