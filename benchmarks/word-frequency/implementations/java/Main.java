import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class Main {
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
      String number = text.substring(start, position);
      return Long.valueOf(number);
    }
    private Map<String,Object> object() {
      Map<String,Object> result = new HashMap<>(); position++; whitespace();
      if (text.charAt(position) == '}') { position++; return result; }
      while (true) {
        whitespace(); String key = string(); whitespace();
        if (text.charAt(position++) != ':') throw new IllegalArgumentException("invalid JSON object");
        result.put(key, value()); whitespace();
        char delimiter = text.charAt(position++);
        if (delimiter == '}') return result;
        if (delimiter != ',') throw new IllegalArgumentException("invalid JSON object");
      }
    }
    private List<Object> array() {
      List<Object> result = new ArrayList<>(); position++; whitespace();
      if (text.charAt(position) == ']') { position++; return result; }
      while (true) {
        result.add(value()); whitespace(); char delimiter = text.charAt(position++);
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
        if (escaped == 'u') { result.append((char) Integer.parseInt(text.substring(position, position + 4), 16)); position += 4; }
        else if (escaped == 'n') result.append('\n');
        else if (escaped == 'r') result.append('\r');
        else if (escaped == 't') result.append('\t');
        else result.append(escaped);
      }
    }
  }
  private static final class Entry {
    final String word; final long count;
    Entry(String word, long count) { this.word = word; this.count = count; }
  }
  private static String argument(String[] args, String name, String fallback) {
    for (int i = 0; i + 1 < args.length; i++) if (args[i].equals(name)) return args[i + 1];
    return fallback;
  }
  private static String quoted(String value) {
    StringBuilder out = new StringBuilder("\"");
    for (int i = 0; i < value.length(); i++) {
      char c = value.charAt(i);
      if (c == '"') out.append("\\\""); else if (c == '\\') out.append("\\\\");
      else if (c == '\n') out.append("\\n"); else if (c == '\r') out.append("\\r");
      else if (c == '\t') out.append("\\t"); else out.append(c);
    }
    return out.append('"').toString();
  }
  private static String checksum(List<Entry> entries) throws Exception {
    StringBuilder lines = new StringBuilder();
    for (Entry entry : entries) lines.append(entry.word).append(',').append(entry.count).append('\n');
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(lines.toString().getBytes(StandardCharsets.UTF_8));
    StringBuilder hex = new StringBuilder(64);
    for (byte b : digest) hex.append(String.format("%02x", b & 255));
    return hex.toString();
  }
  private static String kernel(List<String> words) throws Exception {
    HashMap<String,Long> counts = new HashMap<>();
    for (String word : words) counts.put(word, counts.getOrDefault(word, 0L) + 1L);
    ArrayList<Entry> entries = new ArrayList<>(counts.size());
    for (Map.Entry<String,Long> item : counts.entrySet()) entries.add(new Entry(item.getKey(), item.getValue()));
    entries.sort(Comparator.<Entry>comparingLong(e -> e.count).reversed().thenComparing(e -> e.word));
    StringBuilder out = new StringBuilder("{\"benchmark\":\"word-frequency\",\"version\":1,\"totalWords\":");
    out.append(words.size()).append(",\"uniqueWords\":").append(entries.size()).append(",\"topWords\":[");
    for (int i = 0; i < Math.min(10, entries.size()); i++) {
      if (i > 0) out.append(','); Entry e = entries.get(i);
      out.append("{\"word\":").append(quoted(e.word)).append(",\"count\":").append(e.count).append('}');
    }
    return out.append("],\"checksum\":\"").append(checksum(entries)).append("\"}").toString();
  }
  @SuppressWarnings("unchecked")
  public static void main(String[] args) throws Exception {
    String input = argument(args, "--input", null), output = argument(args, "--output", null), timing = argument(args, "--timing-output", null);
    int warmup = Integer.parseInt(argument(args, "--warmup", "0")), iterations = Integer.parseInt(argument(args, "--iterations", "1"));
    if (input == null || output == null || timing == null) throw new IllegalArgumentException("missing required arguments");
    Map<String,Object> parsed = (Map<String,Object>) new Json(Files.readString(Path.of(input), StandardCharsets.UTF_8)).value();
    List<Object> rawWords = (List<Object>) parsed.get("words"); ArrayList<String> words = new ArrayList<>(rawWords.size());
    for (Object word : rawWords) words.add((String) word);
    String result = null; StringBuilder samples = new StringBuilder("{\"samples\":[");
    for (int run = -warmup; run < iterations; run++) {
      long start = System.nanoTime(); result = kernel(words); long elapsed = Math.max(1L, System.nanoTime() - start);
      if (run >= 0) { if (run > 0) samples.append(','); samples.append("{\"iteration\":").append(run + 1).append(",\"kernelTimeNanoseconds\":").append(elapsed).append('}'); }
    }
    Files.writeString(Path.of(output), result, StandardCharsets.UTF_8);
    Files.writeString(Path.of(timing), samples.append("]}").toString(), StandardCharsets.UTF_8);
  }
}
