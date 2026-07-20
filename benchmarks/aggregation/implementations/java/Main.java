import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.PriorityQueue;

public final class Main {
  private static final String PROTOCOL_VERSION = "2.0.0";
  private static final char[] HEX = "0123456789abcdef".toCharArray();

  private static final class Row {
    final String account;
    final String category;
    final long quantity;
    final long unitPrice;

    Row(String account, String category, long quantity, long unitPrice) {
      this.account = account;
      this.category = category;
      this.quantity = quantity;
      this.unitPrice = unitPrice;
    }
  }

  private static final class Category {
    final String name;
    long quantity;
    long value;

    Category(String name) { this.name = name; }
  }

  private static final class Account {
    final String id;
    long value;

    Account(String id) { this.id = id; }
  }

  private static final class Result {
    long count;
    long quantity;
    long value;
    long min = Long.MAX_VALUE;
    long max;
    ArrayList<Category> categories;
    ArrayList<Account> accounts;
    String checksum;
  }

  private static final Comparator<Category> CATEGORY_ORDER =
      Comparator.comparing(c -> c.name);
  private static final Comparator<Account> ACCOUNT_ORDER = (a, b) -> {
    int value = Long.compare(b.value, a.value);
    return value != 0 ? value : a.id.compareTo(b.id);
  };
  // PriorityQueue root is the worst account currently retained.
  private static final Comparator<Account> WORST_FIRST = (a, b) -> {
    int value = Long.compare(a.value, b.value);
    return value != 0 ? value : b.id.compareTo(a.id);
  };

  private static String[] csv(String line) {
    String[] fields = new String[5];
    int field = 0;
    int start = 0;
    boolean quoted = false;
    StringBuilder quotedField = null;
    for (int i = 0; i < line.length(); i++) {
      char c = line.charAt(i);
      if (c == '"') {
        if (quoted) {
          if (i + 1 < line.length() && line.charAt(i + 1) == '"') {
            if (quotedField == null) quotedField = new StringBuilder(i - start).append(line, start, i);
            quotedField.append('"');
            i++;
          } else {
            quoted = false;
          }
        } else {
          quoted = true;
          quotedField = new StringBuilder();
          if (start < i) quotedField.append(line, start, i);
        }
      } else if (c == ',' && !quoted) {
        fields[field++] = quotedField == null ? line.substring(start, i) : quotedField.toString();
        quotedField = null;
        start = i + 1;
      } else if (quotedField != null) {
        quotedField.append(c);
      }
    }
    fields[field] = quotedField == null ? line.substring(start) : quotedField.toString();
    return fields;
  }

  private static Row[] readRows(String path) throws IOException {
    ArrayList<Row> rows = new ArrayList<>();
    try (BufferedReader reader = Files.newBufferedReader(Path.of(path), StandardCharsets.UTF_8)) {
      reader.readLine();
      String line;
      while ((line = reader.readLine()) != null) {
        String[] fields = csv(line);
        rows.add(new Row(fields[1], fields[2], Long.parseLong(fields[3]), Long.parseLong(fields[4])));
      }
    }
    return rows.toArray(new Row[0]);
  }

  private static String escaped(String value) {
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

  private static String categoriesJson(List<Category> categories) {
    StringBuilder out = new StringBuilder("[");
    for (int i = 0; i < categories.size(); i++) {
      if (i != 0) out.append(',');
      Category c = categories.get(i);
      out.append("{\"category\":").append(escaped(c.name))
          .append(",\"quantity\":").append(c.quantity)
          .append(",\"valueMinorUnits\":").append(c.value).append('}');
    }
    return out.append(']').toString();
  }

  private static String accountsJson(List<Account> accounts) {
    StringBuilder out = new StringBuilder("[");
    for (int i = 0; i < accounts.size(); i++) {
      if (i != 0) out.append(',');
      Account a = accounts.get(i);
      out.append("{\"accountId\":").append(escaped(a.id))
          .append(",\"valueMinorUnits\":").append(a.value).append('}');
    }
    return out.append(']').toString();
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

  private static Result kernel(Row[] rows) throws Exception {
    HashMap<String, Category> categoriesByName = new HashMap<>();
    HashMap<String, Account> accountsById = new HashMap<>();
    Result result = new Result();
    for (Row row : rows) {
      long value = row.quantity * row.unitPrice;
      result.count++;
      result.quantity += row.quantity;
      result.value += value;
      if (value < result.min) result.min = value;
      if (value > result.max) result.max = value;

      Category category = categoriesByName.get(row.category);
      if (category == null) {
        category = new Category(row.category);
        categoriesByName.put(row.category, category);
      }
      category.quantity += row.quantity;
      category.value += value;

      Account account = accountsById.get(row.account);
      if (account == null) {
        account = new Account(row.account);
        accountsById.put(row.account, account);
      }
      account.value += value;
    }

    result.categories = new ArrayList<>(categoriesByName.values());
    result.categories.sort(CATEGORY_ORDER);

    PriorityQueue<Account> top = new PriorityQueue<>(10, WORST_FIRST);
    for (Account account : accountsById.values()) {
      if (top.size() < 10) top.add(account);
      else if (ACCOUNT_ORDER.compare(account, top.peek()) < 0) {
        top.poll();
        top.add(account);
      }
    }
    result.accounts = new ArrayList<>(top);
    result.accounts.sort(ACCOUNT_ORDER);

    String checksumInput = "{\"Categories\":" + categoriesJson(result.categories)
        + ",\"TopAccounts\":" + accountsJson(result.accounts) + "}\n";
    result.checksum = hex(MessageDigest.getInstance("SHA-256")
        .digest(checksumInput.getBytes(StandardCharsets.UTF_8)));
    return result;
  }

  private static String output(Result result) {
    return "{\"benchmark\":\"aggregation\",\"version\":1,\"recordCount\":" + result.count
        + ",\"totalQuantity\":" + result.quantity + ",\"totalValueMinorUnits\":" + result.value
        + ",\"categories\":" + categoriesJson(result.categories)
        + ",\"topAccounts\":" + accountsJson(result.accounts)
        + ",\"minimumTransactionMinorUnits\":" + result.min
        + ",\"maximumTransactionMinorUnits\":" + result.max
        + ",\"checksum\":\"" + result.checksum + "\"}";
  }

  private static String argument(String[] args, String name, String fallback) {
    for (int i = 0; i + 1 < args.length; i++) if (args[i].equals(name)) return args[i + 1];
    return fallback;
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
    if (!PROTOCOL_VERSION.equals(argument(args, "--protocol-version", ""))) {
      throw new IllegalArgumentException("unsupported protocol version");
    }
    String input = argument(args, "--input", null);
    String output = argument(args, "--output", null);
    if (input == null || output == null) throw new IllegalArgumentException("missing required arguments");

    Row[] rows = readRows(input);
    emitLine("{\"type\":\"ready\",\"protocolVersion\":\"" + PROTOCOL_VERSION + "\"}");
    BufferedReader stdin = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    byte[] lastOutput = new byte[0];
    String line;
    while ((line = stdin.readLine()) != null) {
      if (line.isEmpty()) continue;
      String type = protocolField(line, "type");
      if ("run".equals(type)) {
        long requestId = Long.parseLong(protocolField(line, "requestId"));
        lastOutput = output(kernel(rows)).getBytes(StandardCharsets.UTF_8);
        emitLine("{\"type\":\"result\",\"requestId\":" + requestId + ",\"digest\":\"" + digestHex(lastOutput) + "\"}");
      } else if ("finish".equals(type)) {
        Files.write(Path.of(output), lastOutput);
        emitLine("{\"type\":\"finish\",\"digest\":\"" + digestHex(lastOutput) + "\"}");
        break;
      }
    }
  }
}
