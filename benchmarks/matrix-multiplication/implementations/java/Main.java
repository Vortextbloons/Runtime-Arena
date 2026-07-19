import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;

public final class Main {
    private static final char[] HEX = "0123456789abcdef".toCharArray();

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

        JsonInput(String text) { this.text = text; }

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
            long[] values = new long[16];
            int count = 0;
            skipWhitespace();
            expect('[');
            skipWhitespace();
            if (!consume(']')) {
                while (true) {
                    if (count == values.length) {
                        long[] expanded = new long[values.length * 2];
                        System.arraycopy(values, 0, expanded, 0, values.length);
                        values = expanded;
                    }
                    values[count++] = parseLong();
                    skipWhitespace();
                    if (consume(']')) break;
                    expect(',');
                }
            }
            long[] result = new long[count];
            System.arraycopy(values, 0, result, 0, count);
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

    private static final class DigestWriter {
        private final MessageDigest digest;
        private final byte[] buffer = new byte[8192];
        private final byte[] digits = new byte[20];
        private int position;

        DigestWriter(MessageDigest digest) { this.digest = digest; }

        void writeAscii(String value) {
            for (int i = 0; i < value.length(); i++) writeByte((byte) value.charAt(i));
        }

        void writeByte(byte value) {
            if (position == buffer.length) flush();
            buffer[position++] = value;
        }

        void writeLong(long value) {
            if (value == Long.MIN_VALUE) {
                writeAscii("-9223372036854775808");
                return;
            }
            boolean negative = value < 0;
            if (negative) value = -value;
            int start = digits.length;
            do {
                digits[--start] = (byte) ('0' + value % 10);
                value /= 10;
            } while (value != 0);
            if (negative) digits[--start] = '-';
            while (start < digits.length) writeByte(digits[start++]);
        }

        byte[] finish() {
            if (position != 0) digest.update(buffer, 0, position);
            return digest.digest();
        }

        private void flush() {
            digest.update(buffer, 0, position);
            position = 0;
        }
    }

    private static String hex(byte[] digest) {
        char[] result = new char[digest.length * 2];
        for (int i = 0; i < digest.length; i++) {
            int value = digest[i] & 0xff;
            result[i * 2] = HEX[value >>> 4];
            result[i * 2 + 1] = HEX[value & 15];
        }
        return new String(result);
    }

    private static Result kernel(Input input) throws Exception {
        int n = input.dimension;
        long[] product = new long[n * n];
        long valueSum = 0;
        long diagonalSum = 0;
        for (int i = 0; i < n; i++) {
            int leftBase = i * n;
            int outputBase = i * n;
            for (int j = 0; j < n; j++) {
                long sum = 0;
                int rightIndex = j;
                for (int k = 0; k < n; k++, rightIndex += n) {
                    sum += input.left[leftBase + k] * input.right[rightIndex];
                }
                product[outputBase + j] = sum;
                valueSum += sum;
                if (i == j) diagonalSum += sum;
            }
        }

        DigestWriter writer = new DigestWriter(MessageDigest.getInstance("SHA-256"));
        writer.writeAscii("dimension=");
        writer.writeLong(n);
        writer.writeByte((byte) '\n');
        for (long value : product) {
            writer.writeLong(value);
            writer.writeByte((byte) ',');
        }
        writer.writeByte((byte) '\n');
        return new Result(n, valueSum, diagonalSum, hex(writer.finish()));
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
        Files.writeString(Path.of(outputPath), outputJson(result), StandardCharsets.UTF_8);
        Files.writeString(Path.of(timingPath), samples.append("]}").toString(), StandardCharsets.UTF_8);
    }
}
