import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public final class Main {
    private static final class Input {
        final int dimension;
        final long[] left;
        final long[] right;

        Input(int dimension, long[] left, long[] right) {
            this.dimension = dimension;
            this.left = left;
            this.right = right;
        }
    }

    private static final class Result {
        final int dimension;
        final long valueSum;
        final long diagonalSum;
        final String checksum;

        Result(int dimension, long valueSum, long diagonalSum, String checksum) {
            this.dimension = dimension;
            this.valueSum = valueSum;
            this.diagonalSum = diagonalSum;
            this.checksum = checksum;
        }
    }

    private static final class JsonInput {
        private final String text;
        private int position;

        JsonInput(String text) {
            this.text = text;
        }

        Input parse() {
            int dimension = 0;
            long[] left = null;
            long[] right = null;
            skipWhitespace();
            expect('{');
            while (true) {
                skipWhitespace();
                if (consume('}')) break;
                String key = parseString();
                skipWhitespace();
                expect(':');
                if (key.equals("dimension")) dimension = (int) parseLong();
                else if (key.equals("left")) left = parseArray();
                else if (key.equals("right")) right = parseArray();
                else skipValue();
                skipWhitespace();
                if (!consume(',')) {
                    expect('}');
                    break;
                }
            }
            if (left == null || right == null) throw error("missing matrix");
            return new Input(dimension, left, right);
        }

        private long[] parseArray() {
            java.util.ArrayList<Long> values = new java.util.ArrayList<>();
            skipWhitespace();
            expect('[');
            skipWhitespace();
            if (!consume(']')) {
                while (true) {
                    values.add(parseLong());
                    skipWhitespace();
                    if (consume(']')) break;
                    expect(',');
                }
            }
            long[] result = new long[values.size()];
            for (int i = 0; i < result.length; i++) result[i] = values.get(i);
            return result;
        }

        private long parseLong() {
            skipWhitespace();
            int start = position;
            if (position < text.length() && text.charAt(position) == '-') position++;
            while (position < text.length() && Character.isDigit(text.charAt(position))) position++;
            if (start == position || (position == start + 1 && text.charAt(start) == '-')) {
                throw error("expected integer");
            }
            return Long.parseLong(text.substring(start, position));
        }

        private String parseString() {
            skipWhitespace();
            expect('"');
            StringBuilder result = new StringBuilder();
            while (position < text.length()) {
                char c = text.charAt(position++);
                if (c == '"') return result.toString();
                if (c == '\\') {
                    if (position >= text.length()) throw error("unterminated string");
                    char escaped = text.charAt(position++);
                    if (escaped == '"' || escaped == '\\' || escaped == '/') result.append(escaped);
                    else if (escaped == 'n') result.append('\n');
                    else if (escaped == 'r') result.append('\r');
                    else if (escaped == 't') result.append('\t');
                    else throw error("unsupported escape");
                } else result.append(c);
            }
            throw error("unterminated string");
        }

        private void skipValue() {
            skipWhitespace();
            if (position < text.length() && text.charAt(position) == '"') parseString();
            else if (position < text.length() && text.charAt(position) == '[') parseArray();
            else parseLong();
        }

        private void skipWhitespace() {
            while (position < text.length() && Character.isWhitespace(text.charAt(position))) position++;
        }

        private boolean consume(char expected) {
            if (position < text.length() && text.charAt(position) == expected) {
                position++;
                return true;
            }
            return false;
        }

        private void expect(char expected) {
            if (!consume(expected)) throw error("expected '" + expected + "'");
        }

        private IllegalArgumentException error(String message) {
            return new IllegalArgumentException(message + " at position " + position);
        }
    }

    private static Result kernel(Input input) throws NoSuchAlgorithmException {
        int n = input.dimension;
        long[] c = new long[n * n];
        long valueSum = 0;
        long diagonalSum = 0;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                long sum = 0;
                for (int k = 0; k < n; k++) {
                    sum += input.left[i * n + k] * input.right[k * n + j];
                }
                c[i * n + j] = sum;
                valueSum += sum;
                if (i == j) diagonalSum += sum;
            }
        }

        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        digest.update(("dimension=" + n + "\n").getBytes(StandardCharsets.UTF_8));
        for (long value : c) digest.update((Long.toString(value) + ",").getBytes(StandardCharsets.UTF_8));
        digest.update((byte) '\n');
        StringBuilder checksum = new StringBuilder(64);
        for (byte value : digest.digest()) checksum.append(String.format("%02x", value & 0xff));
        return new Result(n, valueSum, diagonalSum, checksum.toString());
    }

    private static String argument(String[] args, String name) {
        for (int i = 0; i + 1 < args.length; i++) if (args[i].equals(name)) return args[i + 1];
        throw new IllegalArgumentException("missing argument " + name);
    }

    private static String outputJson(Result result) {
        int elements = result.dimension * result.dimension;
        return "{\"benchmark\":\"matrix-multiplication\",\"version\":1,\"dimension\":"
                + result.dimension + ",\"elementCount\":" + elements + ",\"valueSum\":"
                + result.valueSum + ",\"diagonalSum\":" + result.diagonalSum + ",\"checksum\":\""
                + result.checksum + "\"}";
    }

    public static void main(String[] args) throws Exception {
        String inputPath = argument(args, "--input");
        String outputPath = argument(args, "--output");
        String timingPath = argument(args, "--timing-output");
        int warmup = Integer.parseInt(argument(args, "--warmup"));
        int iterations = Integer.parseInt(argument(args, "--iterations"));
        Input input = new JsonInput(Files.readString(Path.of(inputPath), StandardCharsets.UTF_8)).parse();

        Result result = null;
        StringBuilder samples = new StringBuilder("{\"samples\":[");
        int measured = 0;
        for (int iteration = -warmup; iteration < iterations; iteration++) {
            long start = System.nanoTime();
            result = kernel(input);
            long elapsed = Math.max(1L, System.nanoTime() - start);
            if (iteration >= 0) {
                if (measured++ > 0) samples.append(',');
                samples.append("{\"iteration\":").append(iteration + 1)
                        .append(",\"kernelTimeNanoseconds\":").append(elapsed).append('}');
            }
        }
        samples.append("]}");
        Files.writeString(Path.of(outputPath), outputJson(result), StandardCharsets.UTF_8);
        Files.writeString(Path.of(timingPath), samples.toString(), StandardCharsets.UTF_8);
    }
}
