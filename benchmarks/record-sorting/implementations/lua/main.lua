local script_dir = arg[0]:match("(.*[/\\])") or "./"
package.path = script_dir .. "?.lua;" .. package.path

local json = require("json")
local sha256 = require("sha256")
local ffi = require("ffi")
ffi.cdef[[typedef long long LARGE_INTEGER; int QueryPerformanceCounter(LARGE_INTEGER*); int QueryPerformanceFrequency(LARGE_INTEGER*);]]
local counter, frequency = ffi.new("LARGE_INTEGER[1]"), ffi.new("LARGE_INTEGER[1]")
ffi.C.QueryPerformanceFrequency(frequency)
local function now_ns() ffi.C.QueryPerformanceCounter(counter); return tonumber(counter[0]) * 1000000000 / tonumber(frequency[0]) end

local input_file, output_file, timing_output_file
local warmups, iterations = 0, 1
local i = 1
while i <= #arg do
    local a = arg[i]
    if a == "--input" then input_file = arg[i+1]; i = i+2
    elseif a == "--output" then output_file = arg[i+1]; i = i+2
    elseif a == "--timing-output" then timing_output_file = arg[i+1]; i = i+2
    elseif a == "--warmup" then warmups = tonumber(arg[i+1]); i = i+2
    elseif a == "--iterations" then iterations = tonumber(arg[i+1]); i = i+2
    else i = i+1 end
end
if not input_file or not output_file or not timing_output_file then
    io.stderr:write("Usage: luajit main.lua --input <input-file> --output <output-file> --timing-output <timing-file>\n"); os.exit(1) end

local f = io.open(input_file, "r"); local data = json.decode(f:read("*a")); f:close()
local records_input = data.records

local function kernel(recs)
    table.sort(recs, function(a, b)
        if a.score ~= b.score then return a.score > b.score end
        if a.timestamp ~= b.timestamp then return a.timestamp < b.timestamp end
        return a.id < b.id
    end)
    local n = #recs
    local take = math.min(n, 10)
    local first = {}
    for j = 1, take do first[j] = recs[j] end
    local last = {}
    for j = n - take + 1, n do last[#last+1] = recs[j] end
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
        checksum = sha256(table.concat(parts))
    }
end

local samples = {}; local sn = 0; local output
for iteration = -warmups, iterations - 1 do
    local recs = {}
    for idx = 1, #records_input do
        local src = records_input[idx]
        recs[idx] = {id=src.id, score=src.score, timestamp=src.timestamp}
    end
    local started = now_ns(); output = kernel(recs)
    local elapsed = math.max(1, math.floor(now_ns() - started + 0.5))
    if iteration >= 0 then sn = sn + 1; samples[sn] = {iteration=iteration+1, kernelTimeNanoseconds=elapsed} end
end
local out = io.open(output_file, "w"); out:write(json.encode(output)); out:close()
local timing = io.open(timing_output_file, "w"); timing:write(json.encode({samples=samples})); timing:close()
