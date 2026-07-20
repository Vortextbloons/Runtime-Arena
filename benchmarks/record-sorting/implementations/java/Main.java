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

  private static int compare(long scoreA, long timestampA, long idA,
                             long scoreB, long timestampB, long idB) {
    int score = Long.compare(scoreB, scoreA);
    if (score != 0) return score;
    int timestamp = Long.compare(timestampA, timestampB);
    return timestamp != 0 ? timestamp : Long.compare(idA, idB);
  }

  private static void recordJson(StringBuilder out, long id, long score, long timestamp) {
    out.append("{\"id\":").append(id)
        .append(",\"score\":").append(score)
        .append(",\"timestamp\":").append(timestamp).append('}');
  }

  private static String kernel(Input source) throws Exception {
    int count = source.ids.length;
    long[] ids = source.ids.clone();
    long[] scores = source.scores.clone();
    long[] timestamps = source.timestamps.clone();
    long[] tempIds = new long[count];
    long[] tempScores = new long[count];
    long[] tempTimestamps = new long[count];

    long[] currentIds = ids;
    long[] currentScores = scores;
    long[] currentTimestamps = timestamps;
    long[] nextIds = tempIds;
    long[] nextScores = tempScores;
    long[] nextTimestamps = tempTimestamps;
    for (int width = 1; width < count; width <<= 1) {
      for (int left = 0; left < count; left += width << 1) {
        int middle = Math.min(left + width, count);
        int right = Math.min(left + (width << 1), count);
        int a = left;
        int b = middle;
        int destination = left;
        while (a < middle && b < right) {
          if (compare(currentScores[a], currentTimestamps[a], currentIds[a],
                      currentScores[b], currentTimestamps[b], currentIds[b]) <= 0) {
            nextIds[destination] = currentIds[a];
            nextScores[destination] = currentScores[a];
            nextTimestamps[destination++] = currentTimestamps[a++];
          } else {
            nextIds[destination] = currentIds[b];
            nextScores[destination] = currentScores[b];
            nextTimestamps[destination++] = currentTimestamps[b++];
          }
        }
        while (a < middle) {
          nextIds[destination] = currentIds[a];
          nextScores[destination] = currentScores[a];
          nextTimestamps[destination++] = currentTimestamps[a++];
        }
        while (b < right) {
          nextIds[destination] = currentIds[b];
          nextScores[destination] = currentScores[b];
          nextTimestamps[destination++] = currentTimestamps[b++];
        }
      }
      long[] swap = currentIds; currentIds = nextIds; nextIds = swap;
      swap = currentScores; currentScores = nextScores; nextScores = swap;
      swap = currentTimestamps; currentTimestamps = nextTimestamps; nextTimestamps = swap;
    }

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

    emitLine("{\"type\":\"ready\",\"protocolVersion\":\"" + PROTOCOL_VERSION + "\"}");
    BufferedReader stdin = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    byte[] lastOutput = new byte[0];
    String line;
    while ((line = stdin.readLine()) != null) {
      if (line.isEmpty()) continue;
      String type = protocolField(line, "type");
      if ("run".equals(type)) {
        long requestId = Long.parseLong(protocolField(line, "requestId"));
        lastOutput = kernel(input).getBytes(StandardCharsets.UTF_8);
        emitLine("{\"type\":\"result\",\"requestId\":" + requestId + ",\"digest\":\"" + digestHex(lastOutput) + "\"}");
      } else if ("finish".equals(type)) {
        Files.write(Path.of(outputFile), lastOutput);
        emitLine("{\"type\":\"finish\",\"digest\":\"" + digestHex(lastOutput) + "\"}");
        break;
      }
    }
  }
}
