import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class Main {
  private static final String PROTOCOL_VERSION = "2.0.0";
  private static final char[] HEX = "0123456789abcdef".toCharArray();

  private static final class Json {
    private final String text;
    private int position;

    Json(String text) { this.text = text; }
    private void whitespace() { while (position < text.length() && Character.isWhitespace(text.charAt(position))) position++; }

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

    private Map<String, Object> object() {
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

    private List<Object> array() {
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

    private String string() {
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

  private static final class Counter {
    final String word;
    int count;

    Counter(String word) { this.word = word; }
  }

  private static final Comparator<Counter> ORDER = (a, b) -> {
    int count = Integer.compare(b.count, a.count);
    return count != 0 ? count : a.word.compareTo(b.word);
  };

  private static String argument(String[] args, String name, String fallback) {
    for (int i = 0; i + 1 < args.length; i++) if (args[i].equals(name)) return args[i + 1];
    return fallback;
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

  private static String quoted(String value) {
    StringBuilder out = new StringBuilder(value.length() + 2).append('"');
    for (int i = 0; i < value.length(); i++) {
      char c = value.charAt(i);
      if (c == '"') out.append("\\\"");
      else if (c == '\\') out.append("\\\\");
      else if (c == '\n') out.append("\\n");
      else if (c == '\r') out.append("\\r");
      else if (c == '\t') out.append("\\t");
      else out.append(c);
    }
    return out.append('"').toString();
  }

  private static String kernel(String[] words) throws Exception {
    HashMap<String, Counter> counts = new HashMap<>();
    for (String word : words) {
      Counter counter = counts.get(word);
      if (counter == null) {
        counter = new Counter(word);
        counts.put(word, counter);
      }
      counter.count++;
    }
    Counter[] entries = counts.values().toArray(new Counter[0]);
    Arrays.sort(entries, ORDER);

    StringBuilder checksumText = new StringBuilder(entries.length * 16);
    for (Counter entry : entries) {
      checksumText.append(entry.word).append(',').append(entry.count).append('\n');
    }
    StringBuilder output = new StringBuilder(512)
        .append("{\"benchmark\":\"word-frequency\",\"version\":1,\"totalWords\":")
        .append(words.length).append(",\"uniqueWords\":").append(entries.length)
        .append(",\"topWords\":[");
    int take = Math.min(10, entries.length);
    for (int i = 0; i < take; i++) {
      if (i != 0) output.append(',');
      output.append("{\"word\":").append(quoted(entries[i].word))
          .append(",\"count\":").append(entries[i].count).append('}');
    }
    String checksum = hex(MessageDigest.getInstance("SHA-256")
        .digest(checksumText.toString().getBytes(StandardCharsets.UTF_8)));
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
    String output = argument(args, "--output", null);
    if (output == null) throw new IllegalArgumentException("missing required arguments");

    Map<String, Object> parsed = (Map<String, Object>) new Json(Files.readString(Path.of(argument(args, "--input", null)), StandardCharsets.UTF_8)).value();
    List<Object> rawWords = (List<Object>) parsed.get("words");
    String[] words = new String[rawWords.size()];
    for (int i = 0; i < words.length; i++) words[i] = (String) rawWords.get(i);

    emitLine("{\"type\":\"ready\",\"protocolVersion\":\"" + PROTOCOL_VERSION + "\"}");
    BufferedReader stdin = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    byte[] lastOutput = new byte[0];
    String line;
    while ((line = stdin.readLine()) != null) {
      if (line.isEmpty()) continue;
      String type = protocolField(line, "type");
      if ("run".equals(type)) {
        long requestId = Long.parseLong(protocolField(line, "requestId"));
        lastOutput = kernel(words).getBytes(StandardCharsets.UTF_8);
        emitLine("{\"type\":\"result\",\"requestId\":" + requestId + ",\"digest\":\"" + digestHex(lastOutput) + "\"}");
      } else if ("finish".equals(type)) {
        Files.write(Path.of(output), lastOutput);
        emitLine("{\"type\":\"finish\",\"digest\":\"" + digestHex(lastOutput) + "\"}");
        break;
      }
    }
  }
}
