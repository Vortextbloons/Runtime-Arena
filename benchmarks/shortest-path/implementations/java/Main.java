import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class Main {
    private static final long INF = Long.MAX_VALUE;

    private static final class Json {
        final String text; int position;
        Json(String text) { this.text = text; }
        void whitespace() { while (position < text.length() && Character.isWhitespace(text.charAt(position))) position++; }
        Object value() {
            whitespace(); char c = text.charAt(position);
            if (c == '{') return object(); if (c == '[') return array(); if (c == '"') return string();
            if (text.startsWith("null", position)) { position += 4; return null; }
            int start = position;
            while (position < text.length() && " ,]}\r\n\t".indexOf(text.charAt(position)) < 0) position++;
            String number = text.substring(start, position);
            return number.indexOf('.') >= 0 || number.indexOf('e') >= 0 || number.indexOf('E') >= 0
                    ? Double.valueOf(number) : Long.valueOf(number);
        }
        Map<String, Object> object() {
            Map<String, Object> result = new HashMap<>(); position++; whitespace();
            if (text.charAt(position) == '}') { position++; return result; }
            while (true) {
                whitespace(); String key = string(); whitespace(); position++;
                result.put(key, value()); whitespace();
                if (text.charAt(position++) == '}') return result;
            }
        }
        List<Object> array() {
            ArrayList<Object> result = new ArrayList<>(); position++; whitespace();
            if (text.charAt(position) == ']') { position++; return result; }
            while (true) {
                result.add(value()); whitespace();
                if (text.charAt(position++) == ']') return result;
            }
        }
        String string() {
            position++; StringBuilder result = new StringBuilder();
            while (text.charAt(position) != '"') {
                char c = text.charAt(position++);
                if (c == '\\') {
                    c = text.charAt(position++);
                    if (c == 'u') { result.append((char) Integer.parseInt(text.substring(position, position + 4), 16)); position += 4; }
                    else result.append(c == 'n' ? '\n' : c == 'r' ? '\r' : c == 't' ? '\t' : c);
                } else result.append(c);
            }
            position++; return result.toString();
        }
    }

    private static final class Query {
        final int id, source, destination;
        Query(int id, int source, int destination) { this.id = id; this.source = source; this.destination = destination; }
    }

    private static final class Graph {
        final int vertexCount;
        final int[] offsets;
        final int[] destinations;
        final long[] weights;
        final Query[] queries;

        Graph(int vertexCount, int[] offsets, int[] destinations, long[] weights, Query[] queries) {
            this.vertexCount = vertexCount; this.offsets = offsets;
            this.destinations = destinations; this.weights = weights; this.queries = queries;
        }
    }

    private static int integer(Object value) { return ((Number) value).intValue(); }
    private static long number(Object value) { return ((Number) value).longValue(); }
    private static String argument(String[] args, String name) {
        for (int i = 0; i + 1 < args.length; i++) if (args[i].equals(name)) return args[i + 1];
        throw new IllegalArgumentException("missing " + name);
    }

    @SuppressWarnings("unchecked")
    private static Graph read(String file) throws IOException {
        Map<String, Object> root = (Map<String, Object>) new Json(Files.readString(Path.of(file), StandardCharsets.UTF_8)).value();
        int vertexCount = integer(root.get("vertexCount"));
        List<Object> rawEdges = (List<Object>) root.get("edges");
        int[] degree = new int[vertexCount];
        for (Object raw : rawEdges) {
            Map<String, Object> edge = (Map<String, Object>) raw;
            degree[integer(edge.get("from"))]++;
        }
        int[] offsets = new int[vertexCount + 1];
        for (int vertex = 0; vertex < vertexCount; vertex++) offsets[vertex + 1] = offsets[vertex] + degree[vertex];
        int[] destinations = new int[rawEdges.size()];
        long[] weights = new long[rawEdges.size()];
        int[] next = Arrays.copyOf(offsets, vertexCount);
        for (Object raw : rawEdges) {
            Map<String, Object> edge = (Map<String, Object>) raw;
            int from = integer(edge.get("from"));
            int slot = next[from]++;
            destinations[slot] = integer(edge.get("to"));
            weights[slot] = number(edge.get("weight"));
        }
        List<Object> rawQueries = (List<Object>) root.get("queries");
        Query[] queries = new Query[rawQueries.size()];
        for (int i = 0; i < queries.length; i++) {
            Map<String, Object> query = (Map<String, Object>) rawQueries.get(i);
            queries[i] = new Query(integer(query.get("id")), integer(query.get("source")), integer(query.get("destination")));
        }
        return new Graph(vertexCount, offsets, destinations, weights, queries);
    }

    private static void push(long[] heapDistances, int[] heapNodes, int[] size, long distance, int node) {
        int index = size[0]++;
        while (index > 0) {
            int parent = (index - 1) >>> 1;
            if (heapDistances[parent] <= distance) break;
            heapDistances[index] = heapDistances[parent];
            heapNodes[index] = heapNodes[parent];
            index = parent;
        }
        heapDistances[index] = distance;
        heapNodes[index] = node;
    }

    private static long popDistance(long[] heapDistances, int[] heapNodes, int[] size) {
        long result = heapDistances[0];
        int last = --size[0];
        if (last == 0) return result;
        long distance = heapDistances[last];
        int node = heapNodes[last];
        int index = 0;
        int half = last >>> 1;
        while (index < half) {
            int child = (index << 1) + 1;
            if (child + 1 < last && heapDistances[child + 1] < heapDistances[child]) child++;
            if (heapDistances[child] >= distance) break;
            heapDistances[index] = heapDistances[child];
            heapNodes[index] = heapNodes[child];
            index = child;
        }
        heapDistances[index] = distance;
        heapNodes[index] = node;
        return result;
    }

    private static String kernel(Graph graph) {
        long[] distances = new long[graph.vertexCount];
        int[] previous = new int[graph.vertexCount];
        long[] heapDistances = new long[graph.weights.length + 1];
        int[] heapNodes = new int[graph.weights.length + 1];
        int[] heapSize = new int[1];
        int[] path = new int[graph.vertexCount];
        StringBuilder output = new StringBuilder(graph.queries.length * 64)
                .append("{\"benchmark\":\"shortest-path\",\"version\":1,\"results\":[");

        for (int queryIndex = 0; queryIndex < graph.queries.length; queryIndex++) {
            Query query = graph.queries[queryIndex];
            Arrays.fill(distances, INF);
            Arrays.fill(previous, -1);
            heapSize[0] = 0;
            distances[query.source] = 0;
            push(heapDistances, heapNodes, heapSize, 0, query.source);
            while (heapSize[0] != 0) {
                int node = heapNodes[0];
                long distance = popDistance(heapDistances, heapNodes, heapSize);
                if (distance != distances[node]) continue;
                for (int edge = graph.offsets[node]; edge < graph.offsets[node + 1]; edge++) {
                    int destination = graph.destinations[edge];
                    long nextDistance = distance + graph.weights[edge];
                    if (nextDistance < distances[destination]) {
                        distances[destination] = nextDistance;
                        previous[destination] = node;
                        push(heapDistances, heapNodes, heapSize, nextDistance, destination);
                    }
                }
            }

            if (queryIndex != 0) output.append(',');
            output.append("{\"queryId\":").append(query.id);
            if (distances[query.destination] == INF) {
                output.append(",\"distance\":null,\"path\":[]}");
                continue;
            }
            output.append(",\"distance\":").append(distances[query.destination]).append(",\"path\":[");
            int pathLength = 0;
            for (int node = query.destination; node != -1; node = previous[node]) path[pathLength++] = node;
            for (int i = pathLength - 1; i >= 0; i--) {
                if (i != pathLength - 1) output.append(',');
                output.append(path[i]);
            }
            output.append("]}");
        }
        return output.append("]}").toString();
    }

    public static void main(String[] args) throws Exception {
        Graph graph = read(argument(args, "--input"));
        String outputFile = argument(args, "--output");
        String timingFile = argument(args, "--timing-output");
        int warmup = Integer.parseInt(argument(args, "--warmup"));
        int iterations = Integer.parseInt(argument(args, "--iterations"));
        String result = null;
        StringBuilder samples = new StringBuilder("{\"samples\":[");
        for (int run = -warmup; run < iterations; run++) {
            long start = System.nanoTime();
            result = kernel(graph);
            long elapsed = Math.max(1L, System.nanoTime() - start);
            if (run >= 0) {
                if (run > 0) samples.append(',');
                samples.append("{\"iteration\":").append(run + 1)
                        .append(",\"kernelTimeNanoseconds\":").append(elapsed).append('}');
            }
        }
        Files.writeString(Path.of(outputFile), result, StandardCharsets.UTF_8);
        Files.writeString(Path.of(timingFile), samples.append("]}").toString(), StandardCharsets.UTF_8);
    }
}
