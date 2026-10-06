import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class Main {
    private static final String PROTOCOL_VERSION = "2.0.0";
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
    static final class Body { double mass, px, py, pz, vx, vy, vz; }
    static final class Input { int steps; double dt; int n; double[] mass, ipx, ipy, ipz, ivx, ivy, ivz; }
    static Input readInput(String file) throws IOException {
        @SuppressWarnings("unchecked") Map<String,Object> m = (Map<String,Object>) new Json(Files.readString(Path.of(file))).value();
        Input in = new Input(); in.steps=i(m.get("steps")); in.dt=n(m.get("deltaTime"));
        @SuppressWarnings("unchecked") List<Object> bs=(List<Object>)m.get("bodies"); in.n=bs.size();
        int count = in.n;
        in.mass=new double[count]; in.ipx=new double[count]; in.ipy=new double[count]; in.ipz=new double[count];
        in.ivx=new double[count]; in.ivy=new double[count]; in.ivz=new double[count];
        for(int j=0;j<count;j++){ @SuppressWarnings("unchecked") Map<String,Object> x=(Map<String,Object>)bs.get(j); @SuppressWarnings("unchecked") List<Object> p=(List<Object>)x.get("position"); @SuppressWarnings("unchecked") List<Object> v=(List<Object>)x.get("velocity"); in.mass[j]=n(x.get("mass")); in.ipx[j]=n(p.get(0)); in.ipy[j]=n(p.get(1)); in.ipz[j]=n(p.get(2)); in.ivx[j]=n(v.get(0)); in.ivy[j]=n(v.get(1)); in.ivz[j]=n(v.get(2)); }
        return in;
    }
    static final char[] HEX = "0123456789abcdef".toCharArray();
    static String toHex(byte[] d) { char[] c = new char[d.length * 2]; for (int k = 0; k < d.length; k++) { int v = d[k] & 255; c[k * 2] = HEX[v >>> 4]; c[k * 2 + 1] = HEX[v & 15]; } return new String(c); }
    static Result kernel(Input in, double[] mass, double[] px, double[] py, double[] pz, double[] vx, double[] vy, double[] vz) throws Exception {
        int count = in.n;
        double dt = in.dt;
        int steps = in.steps;
        System.arraycopy(in.ipx, 0, px, 0, count);
        System.arraycopy(in.ipy, 0, py, 0, count);
        System.arraycopy(in.ipz, 0, pz, 0, count);
        System.arraycopy(in.ivx, 0, vx, 0, count);
        System.arraycopy(in.ivy, 0, vy, 0, count);
        System.arraycopy(in.ivz, 0, vz, 0, count);
        System.arraycopy(in.mass, 0, mass, 0, count);
        for(int step=0;step<steps;step++){
            for(int a=0;a<count;a++){
                double pax=px[a],pay=py[a],paz=pz[a],ma=mass[a],vax=vx[a],vay=vy[a],vaz=vz[a];
                for(int c=a+1;c<count;c++){
                    double dx=px[c]-pax,dy=py[c]-pay,dz=pz[c]-paz,r2=dx*dx+dy*dy+dz*dz,m=dt/(r2*Math.sqrt(r2));
                    double ym=mass[c]*m,xm=ma*m;
                    vax+=dx*ym;vay+=dy*ym;vaz+=dz*ym;vx[c]-=dx*xm;vy[c]-=dy*xm;vz[c]-=dz*xm;
                }
                vx[a]=vax;vy[a]=vay;vz[a]=vaz;
            }
            for(int a=0;a<count;a++){px[a]+=dt*vx[a];py[a]+=dt*vy[a];pz[a]+=dt*vz[a];}
        }
        double energy=0; StringBuilder ps=new StringBuilder(count*48),vs=new StringBuilder(count*48);
        for(int a=0;a<count;a++){
            double vax=vx[a],vay=vy[a],vaz=vz[a],pax=px[a],pay=py[a],paz=pz[a],ma=mass[a];
            energy+=.5*ma*(vax*vax+vay*vay+vaz*vaz);
            for(int c=a+1;c<count;c++){double dx=pax-px[c],dy=pay-py[c],dz=paz-pz[c];energy-=ma*mass[c]/Math.sqrt(dx*dx+dy*dy+dz*dz);}
            ps.append(String.format(Locale.ROOT,"%.9f,%.9f,%.9f,",pax,pay,paz)); vs.append(String.format(Locale.ROOT,"%.9f,%.9f,%.9f,",vax,vay,vaz));
        }
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        return new Result(energy,toHex(md.digest(ps.toString().getBytes(StandardCharsets.UTF_8))),toHex(md.digest(vs.toString().getBytes(StandardCharsets.UTF_8))),count);
    }
    static final class Result { double energy; String pos,vel; int count; Result(double e,String p,String v,int c){energy=e;pos=p;vel=v;count=c;} }
    private static String digestHex(byte[] bytes) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder b = new StringBuilder(64);
        for (byte x : digest) b.append(String.format("%02x", x & 255));
        return b.toString();
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

    public static void main(String[] a) throws Exception {
        if (!PROTOCOL_VERSION.equals(arg(a, "--protocol-version"))) throw new IllegalArgumentException("unsupported protocol version");
        String outFile = arg(a, "--output");
        Input in = readInput(arg(a, "--input"));
        int count = in.n;
        double[] mass = new double[count], px = new double[count], py = new double[count], pz = new double[count],
                 vx = new double[count], vy = new double[count], vz = new double[count];
        emitLine("{\"type\":\"ready\",\"protocolVersion\":\"" + PROTOCOL_VERSION + "\"}");
        BufferedReader stdin = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        byte[] lastOutput = new byte[0];
        String line;
        while ((line = stdin.readLine()) != null) {
            if (line.isEmpty()) continue;
            String type = protocolField(line, "type");
            if ("run".equals(type)) {
                long requestId = Long.parseLong(protocolField(line, "requestId"));
                Result out = kernel(in, mass, px, py, pz, vx, vy, vz);
                String result = "{\"benchmark\":\"nbody\",\"version\":1,\"bodyCount\":" + out.count
                    + ",\"finalEnergy\":" + Double.toString(out.energy)
                    + ",\"positionChecksum\":\"" + out.pos + "\",\"velocityChecksum\":\"" + out.vel + "\"}";
                lastOutput = result.getBytes(StandardCharsets.UTF_8);
                emitLine("{\"type\":\"result\",\"requestId\":" + requestId + ",\"digest\":\"" + digestHex(lastOutput) + "\"}");
            } else if ("finish".equals(type)) {
                Files.write(Path.of(outFile), lastOutput);
                emitLine("{\"type\":\"finish\",\"digest\":\"" + digestHex(lastOutput) + "\"}");
                break;
            }
        }
    }
}
