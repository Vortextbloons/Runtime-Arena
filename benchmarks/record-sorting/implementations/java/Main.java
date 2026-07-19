import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class Main {
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

  @SuppressWarnings("unchecked")
  private static final double[] T_CRITICAL = {0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045};

  private static double ciWidth(long[] samples) {
    int n = samples.length;
    if (n < 2) return Double.POSITIVE_INFINITY;
    double mean = 0;
    for (long value : samples) mean += value;
    mean /= n;
    if (mean <= 0) return Double.POSITIVE_INFINITY;
    double variance = 0;
    for (long value : samples) {
      double delta = value - mean;
      variance += delta * delta;
    }
    variance /= (n - 1);
    double t = n < T_CRITICAL.length ? T_CRITICAL[n] : 2.0;
    return (2 * t * Math.sqrt(variance / n)) / mean;
  }

  public static void main(String[] args) throws Exception {
    String inputFile = argument(args, "--input", null);
    String outputFile = argument(args, "--output", null);
    String timingFile = argument(args, "--timing-output", null);
    int warmup = Integer.parseInt(argument(args, "--warmup", "0"));
    int minIterations = Integer.parseInt(argument(args, "--min-iterations", "1"));
    int maxIterations = Integer.parseInt(argument(args, "--max-iterations", "1"));
    double targetCi = Double.parseDouble(argument(args, "--target-relative-ci", "0.05"));
    if (inputFile == null || outputFile == null || timingFile == null) throw new IllegalArgumentException("missing required arguments");

    Map<String, Object> root = (Map<String, Object>) new Json(Files.readString(Path.of(inputFile), StandardCharsets.UTF_8)).value();
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

    String result = null;
    StringBuilder samples = new StringBuilder("{\"samples\":[");
    long[] kernelTimes = new long[maxIterations];
    int kernelCount = 0;
    for (int run = -warmup; ; run++) {
      long start = System.nanoTime();
      result = kernel(input);
      long elapsed = Math.max(1L, System.nanoTime() - start);
      if (run >= 0) {
        kernelTimes[kernelCount++] = elapsed;
        if (run > 0) samples.append(',');
        samples.append("{\"iteration\":").append(kernelCount)
            .append(",\"kernelTimeNanoseconds\":").append(elapsed).append('}');
        if (kernelCount >= maxIterations || (kernelCount >= minIterations && ciWidth(java.util.Arrays.copyOf(kernelTimes, kernelCount)) <= targetCi)) break;
      }
    }
    Files.writeString(Path.of(outputFile), result, StandardCharsets.UTF_8);
    Files.writeString(Path.of(timingFile), samples.append("]}").toString(), StandardCharsets.UTF_8);
  }
}
