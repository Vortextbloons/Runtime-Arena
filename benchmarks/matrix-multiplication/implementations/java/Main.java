import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;

public final class Main {
    private static final String PROTOCOL_VERSION = "2.0.0";
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
            for (int j = 0; j < n; j++)
                product[outputBase + j] = 0;
            for (int k = 0; k < n; k++) {
                long a_ik = input.left[leftBase + k];
                int rightBase = k * n;
                for (int j = 0; j < n; j++)
                    product[outputBase + j] += a_ik * input.right[rightBase + j];
            }
            for (int j = 0; j < n; j++) {
                valueSum += product[outputBase + j];
                if (i == j) diagonalSum += product[outputBase + j];
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

    private static String digestHex(byte[] bytes) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        return hex(digest);
    }

    private static void emitLine(String json) {
        System.out.println(json);
        System.out.flush();
    }

    private static String protocolField(String line, String field) {
        String key = "\"" + field + "\":";
        int start = line.indexOf(key);
        if (start < 0) return null;
        start += key.length();
        while (start < line.length() && line.charAt(start) == ' ') start++;
        if (line.charAt(start) == '"') {
            int end = line.indexOf('"', start + 1);
            return line.substring(start + 1, end);
        }
        int end = start;
        while (end < line.length() && ",} ".indexOf(line.charAt(end)) < 0) end++;
        return line.substring(start, end);
    }

    public static void main(String[] args) throws Exception {
        if (!PROTOCOL_VERSION.equals(argument(args, "--protocol-version"))) {
            throw new IllegalArgumentException("unsupported protocol version");
        }
        String outputPath = argument(args, "--output");
        Input input = new JsonInput(Files.readString(Path.of(argument(args, "--input")), StandardCharsets.UTF_8)).parse();

        emitLine("{\"type\":\"ready\",\"protocolVersion\":\"" + PROTOCOL_VERSION + "\"}");
        BufferedReader stdin = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        byte[] lastOutput = new byte[0];
        String line;
        while ((line = stdin.readLine()) != null) {
            if (line.isEmpty()) continue;
            String type = protocolField(line, "type");
            if ("run".equals(type)) {
                long requestId = Long.parseLong(protocolField(line, "requestId"));
                lastOutput = outputJson(kernel(input)).getBytes(StandardCharsets.UTF_8);
                emitLine("{\"type\":\"result\",\"requestId\":" + requestId + ",\"digest\":\"" + digestHex(lastOutput) + "\"}");
            } else if ("finish".equals(type)) {
                Files.write(Path.of(outputPath), lastOutput);
                emitLine("{\"type\":\"finish\",\"digest\":\"" + digestHex(lastOutput) + "\"}");
                break;
            }
        }
    }
}
