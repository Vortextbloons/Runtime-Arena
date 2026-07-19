import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.HashMap;

public final class Main {
  private static final class Json {
    final String text; int position;
    Json(String text) { this.text = text; }
    void whitespace() { while (position < text.length() && Character.isWhitespace(text.charAt(position))) position++; }
    Object value() { whitespace(); char c=text.charAt(position); if(c=='{')return object(); if(c=='[')return array(); if(c=='"')return string(); int s=position; while(position<text.length() && ",]} \t\r\n".indexOf(text.charAt(position))<0)position++; return Long.valueOf(text.substring(s,position)); }
    Map<String,Object> object() { Map<String,Object> m=new HashMap<>(); position++; whitespace(); if(text.charAt(position)=='}'){position++;return m;} while(true){whitespace();String k=string();whitespace();if(text.charAt(position++)!=':')throw new IllegalArgumentException("invalid JSON object");m.put(k,value());whitespace();char d=text.charAt(position++);if(d=='}')return m;if(d!=',')throw new IllegalArgumentException("invalid JSON object");} }
    List<Object> array() { List<Object> a=new ArrayList<>();position++;whitespace();if(text.charAt(position)==']'){position++;return a;}while(true){a.add(value());whitespace();char d=text.charAt(position++);if(d==']')return a;if(d!=',')throw new IllegalArgumentException("invalid JSON array");} }
    String string() { if(text.charAt(position++)!='"')throw new IllegalArgumentException("invalid JSON string");StringBuilder b=new StringBuilder();while(true){char c=text.charAt(position++);if(c=='"')return b.toString();if(c!='\\'){b.append(c);continue;}char e=text.charAt(position++);if(e=='u'){b.append((char)Integer.parseInt(text.substring(position,position+4),16));position+=4;}else if(e=='n')b.append('\n');else if(e=='r')b.append('\r');else if(e=='t')b.append('\t');else b.append(e);}}
  }
  private static final class Record { long id, score, timestamp; Record(long id,long score,long timestamp){this.id=id;this.score=score;this.timestamp=timestamp;} }
  private static String argument(String[] a,String n,String d){for(int i=0;i+1<a.length;i++)if(a[i].equals(n))return a[i+1];return d;}
  private static String checksum(List<Record> records)throws Exception{StringBuilder b=new StringBuilder();for(Record r:records)b.append(r.id).append(',').append(r.score).append(',').append(r.timestamp).append('\n');byte[] d=MessageDigest.getInstance("SHA-256").digest(b.toString().getBytes(StandardCharsets.UTF_8));StringBuilder h=new StringBuilder(64);for(byte x:d)h.append(String.format("%02x",x&255));return h.toString();}
  private static String recordJson(Record r){return "{\"id\":"+r.id+",\"score\":"+r.score+",\"timestamp\":"+r.timestamp+"}";}
  private static String kernel(List<Record> source)throws Exception{
    ArrayList<Record> records=new ArrayList<>(source.size());for(Record r:source)records.add(new Record(r.id,r.score,r.timestamp));
    records.sort(Comparator.<Record>comparingLong(r->r.score).reversed().thenComparingLong(r->r.timestamp).thenComparingLong(r->r.id));
    int take=Math.min(10,records.size());StringBuilder out=new StringBuilder("{\"benchmark\":\"record-sorting\",\"version\":1,\"recordCount\":").append(records.size()).append(",\"firstRecords\":[");
    for(int i=0;i<take;i++){if(i>0)out.append(',');out.append(recordJson(records.get(i)));}out.append("],\"lastRecords\":[");
    for(int i=records.size()-take;i<records.size();i++){if(i>records.size()-take)out.append(',');out.append(recordJson(records.get(i)));}
    return out.append("],\"checksum\":\"").append(checksum(records)).append("\"}").toString();
  }
  @SuppressWarnings("unchecked") public static void main(String[] a)throws Exception{
    String inFile=argument(a,"--input",null),outFile=argument(a,"--output",null),timingFile=argument(a,"--timing-output",null);int warm=Integer.parseInt(argument(a,"--warmup","0")),iterations=Integer.parseInt(argument(a,"--iterations","1"));if(inFile==null||outFile==null||timingFile==null)throw new IllegalArgumentException("missing required arguments");
    Map<String,Object> root=(Map<String,Object>)new Json(Files.readString(Path.of(inFile),StandardCharsets.UTF_8)).value();List<Object> raw=(List<Object>)root.get("records");ArrayList<Record> records=new ArrayList<>(raw.size());for(Object item:raw){Map<String,Object> m=(Map<String,Object>)item;records.add(new Record(((Number)m.get("id")).longValue(),((Number)m.get("score")).longValue(),((Number)m.get("timestamp")).longValue()));}
    String result=null;StringBuilder samples=new StringBuilder("{\"samples\":[");for(int run=-warm;run<iterations;run++){long start=System.nanoTime();result=kernel(records);long elapsed=Math.max(1L,System.nanoTime()-start);if(run>=0){if(run>0)samples.append(',');samples.append("{\"iteration\":").append(run+1).append(",\"kernelTimeNanoseconds\":").append(elapsed).append('}');}}Files.writeString(Path.of(outFile),result,StandardCharsets.UTF_8);Files.writeString(Path.of(timingFile),samples.append("]}").toString(),StandardCharsets.UTF_8);
  }
}
