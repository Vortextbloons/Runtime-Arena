import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class Main {
    private static final class Json {
        final String s; int p;
        Json(String s) { this.s = s; }
        Object value() {
            ws(); char c = s.charAt(p);
            if (c == '{') return object(); if (c == '[') return array();
            if (c == '"') return string(); if (s.startsWith("true", p)) { p += 4; return Boolean.TRUE; }
            if (s.startsWith("false", p)) { p += 5; return Boolean.FALSE; }
            if (s.startsWith("null", p)) { p += 4; return null; }
            int start = p; while (p < s.length() && " ,]}\r\n\t".indexOf(s.charAt(p)) < 0) p++;
            String n = s.substring(start, p); return n.indexOf('.') >= 0 || n.indexOf('e') >= 0 || n.indexOf('E') >= 0 ? Double.valueOf(n) : Long.valueOf(n);
        }
        Map<String,Object> object() { java.util.LinkedHashMap<String,Object> m = new java.util.LinkedHashMap<>(); p++; ws(); if (s.charAt(p) == '}') { p++; return m; } for (;;) { ws(); String k = string(); ws(); p++; m.put(k, value()); ws(); if (s.charAt(p++) == '}') return m; } }
        List<Object> array() { ArrayList<Object> a = new ArrayList<>(); p++; ws(); if (s.charAt(p) == ']') { p++; return a; } for (;;) { a.add(value()); ws(); if (s.charAt(p++) == ']') return a; } }
        String string() { p++; StringBuilder b = new StringBuilder(); while (s.charAt(p) != '"') { char c = s.charAt(p++); if (c == '\\') { c = s.charAt(p++); if (c == 'u') { b.append((char)Integer.parseInt(s.substring(p, p + 4), 16)); p += 4; } else b.append(c == 'n' ? '\n' : c == 'r' ? '\r' : c == 't' ? '\t' : c); } else b.append(c); } p++; return b.toString(); }
        void ws() { while (p < s.length() && Character.isWhitespace(s.charAt(p))) p++; }
    }
    static double n(Object x) { return ((Number)x).doubleValue(); }
    static int i(Object x) { return ((Number)x).intValue(); }
    static String arg(String[] a, String name) { for (int j = 0; j + 1 < a.length; j++) if (a[j].equals(name)) return a[j + 1]; throw new IllegalArgumentException("missing " + name); }
    static String hash(String s) throws Exception { byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)); StringBuilder b = new StringBuilder(64); for (byte x : d) b.append(String.format("%02x", x & 255)); return b.toString(); }
    static final class Body { double mass, px, py, pz, vx, vy, vz; Body copy() { Body b = new Body(); b.mass=mass; b.px=px; b.py=py; b.pz=pz; b.vx=vx; b.vy=vy; b.vz=vz; return b; } }
    static final class Input { int steps; double dt; Body[] bodies; }
    static Input readInput(String file) throws IOException {
        @SuppressWarnings("unchecked") Map<String,Object> m = (Map<String,Object>) new Json(Files.readString(Path.of(file))).value();
        Input in = new Input(); in.steps=i(m.get("steps")); in.dt=n(m.get("deltaTime"));
        @SuppressWarnings("unchecked") List<Object> bs=(List<Object>)m.get("bodies"); in.bodies=new Body[bs.size()];
        for(int j=0;j<bs.size();j++){ @SuppressWarnings("unchecked") Map<String,Object> x=(Map<String,Object>)bs.get(j); @SuppressWarnings("unchecked") List<Object> p=(List<Object>)x.get("position"); @SuppressWarnings("unchecked") List<Object> v=(List<Object>)x.get("velocity"); Body b=in.bodies[j]; b=new Body(); b.mass=n(x.get("mass")); b.px=n(p.get(0)); b.py=n(p.get(1)); b.pz=n(p.get(2)); b.vx=n(v.get(0)); b.vy=n(v.get(1)); b.vz=n(v.get(2)); in.bodies[j]=b; }
        return in;
    }
    static Result kernel(Input in, Body[] b) throws Exception {
        for(int step=0;step<in.steps;step++){ for(int a=0;a<b.length;a++) for(int c=a+1;c<b.length;c++){ Body x=b[a], y=b[c]; double dx=y.px-x.px,dy=y.py-x.py,dz=y.pz-x.pz,r2=dx*dx+dy*dy+dz*dz,m=in.dt/(r2*Math.sqrt(r2)); double ym=y.mass*m,xm=x.mass*m; x.vx+=dx*ym;x.vy+=dy*ym;x.vz+=dz*ym;y.vx-=dx*xm;y.vy-=dy*xm;y.vz-=dz*xm; } for(Body x:b){x.px+=in.dt*x.vx;x.py+=in.dt*x.vy;x.pz+=in.dt*x.vz;} }
        double energy=0; StringBuilder ps=new StringBuilder(),vs=new StringBuilder();
        for(int a=0;a<b.length;a++){ Body x=b[a]; energy+=.5*x.mass*(x.vx*x.vx+x.vy*x.vy+x.vz*x.vz); for(int c=a+1;c<b.length;c++){Body y=b[c];double dx=x.px-y.px,dy=x.py-y.py,dz=x.pz-y.pz;energy-=x.mass*y.mass/Math.sqrt(dx*dx+dy*dy+dz*dz);} ps.append(String.format(Locale.ROOT,"%.9f,%.9f,%.9f,",x.px,x.py,x.pz)); vs.append(String.format(Locale.ROOT,"%.9f,%.9f,%.9f,",x.vx,x.vy,x.vz)); }
        return new Result(energy,hash(ps.toString()),hash(vs.toString()),b.length);
    }
    static final class Result { double energy; String pos,vel; int count; Result(double e,String p,String v,int c){energy=e;pos=p;vel=v;count=c;} }
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

  public static void main(String[] a) throws Exception {
        Input in=readInput(arg(a,"--input")); String outFile=arg(a,"--output"), timingFile=arg(a,"--timing-output"); int warm=i(Long.valueOf(arg(a,"--warmup"))), minIt=i(Long.valueOf(arg(a,"--min-iterations"))), maxIt=i(Long.valueOf(arg(a,"--max-iterations"))); double targetCi=Double.parseDouble(arg(a,"--target-relative-ci")); Result out=null; StringBuilder samples=new StringBuilder("{\"samples\":["); long[] kernelTimes=new long[maxIt]; int kernelCount=0, measured=0;
        for(int run=-warm;;run++){Body[] b=new Body[in.bodies.length];for(int j=0;j<b.length;j++)b[j]=in.bodies[j].copy();long start=System.nanoTime();out=kernel(in,b);long elapsed=Math.max(1,System.nanoTime()-start);if(run>=0){kernelTimes[kernelCount++]=elapsed;if(measured++>0)samples.append(',');samples.append("{\"iteration\":").append(measured).append(",\"kernelTimeNanoseconds\":").append(elapsed).append('}');if(kernelCount>=maxIt||(kernelCount>=minIt&&ciWidth(java.util.Arrays.copyOf(kernelTimes,kernelCount))<=targetCi))break;}}
        samples.append("]}"); String result="{\"benchmark\":\"nbody\",\"version\":1,\"bodyCount\":"+out.count+",\"finalEnergy\":"+Double.toString(out.energy)+",\"positionChecksum\":\""+out.pos+"\",\"velocityChecksum\":\""+out.vel+"\"}"; Files.writeString(Path.of(outFile),result); Files.writeString(Path.of(timingFile),samples.toString());
    }
}
