import json
import sys
import heapq

def main():
    input_file = None
    output_file = None
    
    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == "--input":
            input_file = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == "--output":
            output_file = sys.argv[i + 1]
            i += 2
        else:
            i += 1
    
    if not input_file or not output_file:
        print("Usage: python main.py --input <input-file> --output <output-file>", file=sys.stderr)
        sys.exit(1)
    
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    vertex_count = data['vertexCount']
    edges = data['edges']
    queries = data['queries']
    
    # Build adjacency list
    adjacency = [[] for _ in range(vertex_count)]
    for edge in edges:
        adjacency[edge['from']].append(edge)
    
    results = []
    
    for query in queries:
        source = query['source']
        destination = query['destination']
        
        # Initialize distances and previous nodes
        distance = [float('inf')] * vertex_count
        previous = [-1] * vertex_count
        distance[source] = 0
        
        # Priority queue: (distance, node)
        heap = [(0, source)]
        
        while heap:
            cost, node = heapq.heappop(heap)
            
            # Skip stale entries
            if cost != distance[node]:
                continue
            
            # Process neighbors
            for edge in adjacency[node]:
                next_cost = cost + edge['weight']
                if next_cost < distance[edge['to']]:
                    distance[edge['to']] = next_cost
                    previous[edge['to']] = node
                    heapq.heappush(heap, (next_cost, edge['to']))
        
        # Build result
        if distance[destination] == float('inf'):
            results.append({
                "queryId": query['id'],
                "distance": None,
                "path": []
            })
        else:
            # Trace back path
            path = []
            node = destination
            while node != -1:
                path.append(node)
                node = previous[node]
            path.reverse()
            
            results.append({
                "queryId": query['id'],
                "distance": distance[destination],
                "path": path
            })
    
    output = {
        "benchmark": "shortest-path",
        "version": 1,
        "results": results
    }
    
    with open(output_file, 'w') as f:
        json.dump(output, f)

if __name__ == "__main__":
    main()
