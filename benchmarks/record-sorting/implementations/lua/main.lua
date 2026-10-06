local script_dir = arg[0]:match("(.*[/\\])") or "./"
local min = math.min
local floor = math.floor
local sort = table.sort
local concat = table.concat
local open = io.open
package.path = script_dir .. "?.lua;" .. package.path

local json = require("json")
local sha256 = require("sha256")
local PROTOCOL_VERSION = "2.0.0"

local function arg_value(name)
    for i = 1, #arg do
        if arg[i] == name then return arg[i + 1] end
    end
end

local input_file = arg_value("--input")
local output_file = arg_value("--output")
local protocol_version = arg_value("--protocol-version")
if protocol_version ~= PROTOCOL_VERSION then
    io.stderr:write("unsupported protocol version " .. tostring(protocol_version) .. "\n")
    os.exit(1)
end
if not input_file or not output_file then
    io.stderr:write("Usage: lua main.lua --input <input-file> --output <output-file> --protocol-version 2.0.0\n")
    os.exit(1)
end

local function respond(obj)
    io.write(json.encode(obj), "\n")
    io.flush()
end

local function digest_output(output)
    return sha256(json.encode(output))
end

local f = open(input_file, "r"); local data = json.decode(f:read("*a")); f:close()
local records_input = data.records
data = nil

local n = #records_input
local ids = {}
local scores = {}
local timestamps = {}
local idMin, idMax = math.huge, -math.huge
local scoreMin, scoreMax = math.huge, -math.huge
local tsMin, tsMax = math.huge, -math.huge
for i = 1, n do
    local r = records_input[i]
    local id, sc, ts = r.id, r.score, r.timestamp
    ids[i] = id; scores[i] = sc; timestamps[i] = ts
    if id < idMin then idMin = id end
    if id > idMax then idMax = id end
    if sc < scoreMin then scoreMin = sc end
    if sc > scoreMax then scoreMax = sc end
    if ts < tsMin then tsMin = ts end
    if ts > tsMax then tsMax = ts end
end
if n == 0 then
    idMin, idMax = 0, 0
    scoreMin, scoreMax = 0, 0
    tsMin, tsMax = 0, 0
end

-- Packed-key sort: key = ((scoreMax-score)*tsSpan + (ts-tsMin))*idSpan + (id-idMin).
-- Ascending key order == score desc, timestamp asc, id asc. Exact in float64
-- while the three spans multiply below 2^52.
local tsSpan = tsMax - tsMin + 1
local idSpan = idMax - idMin + 1
local scoreSpan = scoreMax - scoreMin + 1
local usePacked = scoreSpan <= 4503599627370496 / tsSpan / idSpan

local keys = {}
for i = 1, n do keys[i] = 0 end

-- PUC Lua 5.3+ stringifies integral floats with a ".0" suffix ("999.0"),
-- which would corrupt the checksum preimage. LuaJIT prints them plainly.
-- Branch once at startup so each interpreter keeps its fastest path.
local fmt_line
if math.type ~= nil then
    fmt_line = function(id, sc, ts) return string.format("%d,%d,%d\n", id, sc, ts) end
else
    fmt_line = function(id, sc, ts) return id .. "," .. sc .. "," .. ts .. "\n" end
end

local function kernel_packed()
    for i = 1, n do
        keys[i] = ((scoreMax - scores[i]) * tsSpan + (timestamps[i] - tsMin)) * idSpan + (ids[i] - idMin)
    end
    sort(keys)
    local take = min(n, 10)
    local first = {}
    local last = {}
    local parts = {}
    for j = 1, n do
        local k = keys[j]
        local rmid = k % idSpan
        local id = rmid + idMin
        local q = (k - rmid) / idSpan
        local rts = q % tsSpan
        local ts = rts + tsMin
        local sc = scoreMax - (q - rts) / tsSpan
        parts[j] = fmt_line(id, sc, ts)
        if j <= take then first[j] = {id=id, score=sc, timestamp=ts} end
        local li = j - (n - take)
        if li >= 1 then last[li] = {id=id, score=sc, timestamp=ts} end
    end
    return {
        benchmark = "record-sorting",
        version = 1,
        recordCount = n,
        firstRecords = first,
        lastRecords = last,
        checksum = sha256(concat(parts))
    }
end

local function kernel_generic()
    local recs = {}
    for idx = 1, n do
        recs[idx] = {id=ids[idx], score=scores[idx], timestamp=timestamps[idx]}
    end
    sort(recs, function(a, b)
        local sa, sb = a.score, b.score
        if sa ~= sb then return sa > sb end
        local ta, tb = a.timestamp, b.timestamp
        if ta ~= tb then return ta < tb end
        return a.id < b.id
    end)
    local take = min(n, 10)
    local first = {}
    for j = 1, take do first[j] = recs[j] end
    local last = {}
    local last_start = n - take + 1
    for j = last_start, n do last[#last+1] = recs[j] end
    local parts = {}
    for j = 1, n do
        local r = recs[j]
        parts[j] = r.id .. "," .. r.score .. "," .. r.timestamp .. "\n"
    end
    return {
        benchmark = "record-sorting",
        version = 1,
        recordCount = n,
        firstRecords = first,
        lastRecords = last,
        checksum = sha256(concat(parts))
    }
end

local kernel = kernel_packed
if not usePacked then kernel = kernel_generic end

respond({type = "ready", protocolVersion = PROTOCOL_VERSION})
local output
for line in io.stdin:lines() do
    local request = json.decode(line)
    if request.type == "run" then
        output = kernel()
        respond({type = "result", requestId = request.requestId, digest = digest_output(output)})
    elseif request.type == "finish" then
        local digest = digest_output(output)
        local out = open(output_file, "w")
        out:write(json.encode(output))
        out:close()
        respond({type = "finish", digest = digest})
        break
    end
end
