import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class Main {
  private static final String PROTOCOL_VERSION = "2.0.0";
  private static final char[] HEX = "0123456789abcdef".toCharArray();

  private static final class Json {
    final String text;
    int position;

    Json(String text) { this.text = text; }

    void whitespace() { while (position < text.length() && Character.isWhitespace(text.charAt(position))) position++; }

    Object value() {
      whitespace();
      char c = text.charAt(position);
      if (c == '{') return object();
      if (c == '[') return array();
      if (c == '"') return string();
      int start = position;
      while (position < text.length() && ",]} \t\r\n".indexOf(text.charAt(position)) < 0) position++;
      return Long.valueOf(text.substring(start, position));
    }

    Map<String, Object> object() {
      Map<String, Object> result = new HashMap<>();
      position++;
      whitespace();
      if (text.charAt(position) == '}') { position++; return result; }
      while (true) {
        whitespace();
        String key = string();
        whitespace();
        if (text.charAt(position++) != ':') throw new IllegalArgumentException("invalid JSON object");
        result.put(key, value());
        whitespace();
        char delimiter = text.charAt(position++);
        if (delimiter == '}') return result;
        if (delimiter != ',') throw new IllegalArgumentException("invalid JSON object");
      }
    }

    List<Object> array() {
      List<Object> result = new ArrayList<>();
      position++;
      whitespace();
      if (text.charAt(position) == ']') { position++; return result; }
      while (true) {
        result.add(value());
        whitespace();
        char delimiter = text.charAt(position++);
        if (delimiter == ']') return result;
        if (delimiter != ',') throw new IllegalArgumentException("invalid JSON array");
      }
    }

    String string() {
      if (text.charAt(position++) != '"') throw new IllegalArgumentException("invalid JSON string");
      StringBuilder result = new StringBuilder();
      while (true) {
        char c = text.charAt(position++);
        if (c == '"') return result.toString();
        if (c != '\\') { result.append(c); continue; }
        char escaped = text.charAt(position++);
        if (escaped == 'u') {
          result.append((char) Integer.parseInt(text.substring(position, position + 4), 16));
          position += 4;
        } else if (escaped == 'n') result.append('\n');
        else if (escaped == 'r') result.append('\r');
        else if (escaped == 't') result.append('\t');
        else result.append(escaped);
      }
    }
  }

  private static final class Input {
    final long[] ids;
    final long[] scores;
    final long[] timestamps;

    Input(long[] ids, long[] scores, long[] timestamps) {
      this.ids = ids;
      this.scores = scores;
      this.timestamps = timestamps;
    }
  }

  private static final class DigestWriter {
    private final MessageDigest digest;
    private final byte[] buffer = new byte[8192];
    private final byte[] digits = new byte[20];
    private int position;

    DigestWriter(MessageDigest digest) { this.digest = digest; }

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

    private void writeAscii(String value) {
      for (int i = 0; i < value.length(); i++) writeByte((byte) value.charAt(i));
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

  private static String argument(String[] args, String name, String fallback) {
    for (int i = 0; i + 1 < args.length; i++) if (args[i].equals(name)) return args[i + 1];
    return fallback;
  }

  private static long key(long id, long score, long timestamp, int sel) {
    if (sel == 0) return id ^ 0x8000000000000000L;
    if (sel == 1) return timestamp ^ 0x8000000000000000L;
    // score descending
    return score ^ 0x7FFFFFFFFFFFFFFFL;
  }

  private static void radixPass(long[] srcIds, long[] srcScores, long[] srcTimestamps,
                                long[] dstIds, long[] dstScores, long[] dstTimestamps,
                                int count, int sel, int shift, int[] counts) {
    java.util.Arrays.fill(counts, 0);
    for (int i = 0; i < count; i++) {
      long k = key(srcIds[i], srcScores[i], srcTimestamps[i], sel);
      counts[(int) ((k >>> shift) & 0xFFFF)]++;
    }
    int sum = 0;
    for (int d = 0; d < 65536; d++) {
      int c = counts[d];
      counts[d] = sum;
      sum += c;
    }
    for (int i = 0; i < count; i++) {
      long k = key(srcIds[i], srcScores[i], srcTimestamps[i], sel);
      int pos = counts[(int) ((k >>> shift) & 0xFFFF)]++;
      dstIds[pos] = srcIds[i];
      dstScores[pos] = srcScores[i];
      dstTimestamps[pos] = srcTimestamps[i];
    }
  }

  private static void recordJson(StringBuilder out, long id, long score, long timestamp) {
    out.append("{\"id\":").append(id)
        .append(",\"score\":").append(score)
        .append(",\"timestamp\":").append(timestamp).append('}');
  }

  // 12 stable LSD passes over (id, timestamp, score-desc) keys. Fully general.
  // Sorted output lands in auxB (pass 0 reads the pristine inputs directly).
  private static String kernel(Input source,
                               long[] auxAIds, long[] auxAScores, long[] auxATimestamps,
                               long[] auxBIds, long[] auxBScores, long[] auxBTimestamps,
                               int[] counts) throws Exception {
    int count = source.ids.length;
    radixPass(source.ids, source.scores, source.timestamps,
              auxAIds, auxAScores, auxATimestamps, count, 0, 0, counts);
    long[] srcIds = auxAIds, srcScores = auxAScores, srcTimestamps = auxATimestamps;
    long[] dstIds = auxBIds, dstScores = auxBScores, dstTimestamps = auxBTimestamps;
    for (int pass = 1; pass < 12; pass++) {
      radixPass(srcIds, srcScores, srcTimestamps, dstIds, dstScores, dstTimestamps,
                count, pass >> 2, (pass & 3) << 4, counts);
      long[] t = srcIds; srcIds = dstIds; dstIds = t;
      t = srcScores; srcScores = dstScores; dstScores = t;
      t = srcTimestamps; srcTimestamps = dstTimestamps; dstTimestamps = t;
    }
    // 11 swaps from an auxA start lands src on auxB.
    long[] currentIds = auxBIds;
    long[] currentScores = auxBScores;
    long[] currentTimestamps = auxBTimestamps;

    DigestWriter writer = new DigestWriter(MessageDigest.getInstance("SHA-256"));
    for (int i = 0; i < count; i++) {
      writer.writeLong(currentIds[i]); writer.writeByte((byte) ',');
      writer.writeLong(currentScores[i]); writer.writeByte((byte) ',');
      writer.writeLong(currentTimestamps[i]); writer.writeByte((byte) '\n');
    }
    String checksum = hex(writer.finish());
    int take = Math.min(10, count);
    StringBuilder output = new StringBuilder(512)
        .append("{\"benchmark\":\"record-sorting\",\"version\":1,\"recordCount\":")
        .append(count).append(",\"firstRecords\":[");
    for (int i = 0; i < take; i++) {
      if (i != 0) output.append(',');
      recordJson(output, currentIds[i], currentScores[i], currentTimestamps[i]);
    }
    output.append("],\"lastRecords\":[");
    for (int i = count - take; i < count; i++) {
      if (i != count - take) output.append(',');
      recordJson(output, currentIds[i], currentScores[i], currentTimestamps[i]);
    }
    return output.append("],\"checksum\":\"").append(checksum).append("\"}").toString();
  }

  private static String digestHex(byte[] bytes) throws Exception {
    return hex(MessageDigest.getInstance("SHA-256").digest(bytes));
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
    if (!PROTOCOL_VERSION.equals(argument(args, "--protocol-version", ""))) {
      throw new IllegalArgumentException("unsupported protocol version");
    }
    String outputFile = argument(args, "--output", null);
    if (outputFile == null) throw new IllegalArgumentException("missing required arguments");

    Map<String, Object> root = (Map<String, Object>) new Json(Files.readString(Path.of(argument(args, "--input", null)), StandardCharsets.UTF_8)).value();
    List<Object> raw = (List<Object>) root.get("records");
    long[] ids = new long[raw.size()];
    long[] scores = new long[raw.size()];
    long[] timestamps = new long[raw.size()];
    for (int i = 0; i < raw.size(); i++) {
      Map<String, Object> record = (Map<String, Object>) raw.get(i);
      ids[i] = ((Number) record.get("id")).longValue();
      scores[i] = ((Number) record.get("score")).longValue();
      timestamps[i] = ((Number) record.get("timestamp")).longValue();
    }
    Input input = new Input(ids, scores, timestamps);
    int count = ids.length;
    long[] auxAIds = new long[count];
    long[] auxAScores = new long[count];
    long[] auxATimestamps = new long[count];
    long[] auxBIds = new long[count];
    long[] auxBScores = new long[count];
    long[] auxBTimestamps = new long[count];
    int[] counts = new int[65536];

    emitLine("{\"type\":\"ready\",\"protocolVersion\":\"" + PROTOCOL_VERSION + "\"}");
    BufferedReader stdin = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    byte[] lastOutput = new byte[0];
    String line;
    while ((line = stdin.readLine()) != null) {
      if (line.isEmpty()) continue;
      String type = protocolField(line, "type");
      if ("run".equals(type)) {
        long requestId = Long.parseLong(protocolField(line, "requestId"));
        lastOutput = kernel(input, auxAIds, auxAScores, auxATimestamps,
                                     auxBIds, auxBScores, auxBTimestamps, counts).getBytes(StandardCharsets.UTF_8);
        emitLine("{\"type\":\"result\",\"requestId\":" + requestId + ",\"digest\":\"" + digestHex(lastOutput) + "\"}");
      } else if ("finish".equals(type)) {
        Files.write(Path.of(outputFile), lastOutput);
        emitLine("{\"type\":\"finish\",\"digest\":\"" + digestHex(lastOutput) + "\"}");
        break;
      }
    }
  }
}
