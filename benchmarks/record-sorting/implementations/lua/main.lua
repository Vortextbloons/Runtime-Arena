local script_dir = arg[0]:match("(.*[/\\])") or "./"
local T={0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045}
local huge = math.huge
local floor = math.floor
local min = math.min
local sort = table.sort
local concat = table.concat
local sqrt = math.sqrt
local open = io.open

local function ci_width(samples)
    local n = #samples
    if n < 2 then return huge end
    local sum = 0
    for i = 1, n do sum = sum + samples[i] end
    local mean = sum / n
    if mean <= 0 then return huge end
    local var = 0
    for i = 1, n do local d = samples[i] - mean; var = var + d * d end
    var = var / (n - 1)
    local t = T[n + 1] or 2
    return 2 * t * sqrt(var / n) / mean
end
package.path = script_dir .. "?.lua;" .. package.path

local json = require("json")
local sha256 = require("sha256")
local ffi = require("ffi")
ffi.cdef[[typedef long long LARGE_INTEGER; int QueryPerformanceCounter(LARGE_INTEGER*); int QueryPerformanceFrequency(LARGE_INTEGER*);]]
local counter, frequency = ffi.new("LARGE_INTEGER[1]"), ffi.new("LARGE_INTEGER[1]")
ffi.C.QueryPerformanceFrequency(frequency)
local function now_ns() ffi.C.QueryPerformanceCounter(counter); return tonumber(counter[0]) * 1000000000 / tonumber(frequency[0]) end

local input_file, output_file, timing_output_file
local warmups, min_iterations, max_iterations, target_ci = 0, 1, 1, 0.05
local i = 1
while i <= #arg do
    local a = arg[i]
    if a == "--input" then input_file = arg[i+1]; i = i+2
    elseif a == "--output" then output_file = arg[i+1]; i = i+2
    elseif a == "--timing-output" then timing_output_file = arg[i+1]; i = i+2
    elseif a == "--warmup" then warmups = tonumber(arg[i+1]); i = i+2
    elseif a == "--min-iterations" then min_iterations = tonumber(arg[i+1]); i = i+2
    elseif a == "--max-iterations" then max_iterations = tonumber(arg[i+1]); i = i+2
    elseif a == "--target-relative-ci" then target_ci = tonumber(arg[i+1]); i = i+2
    else i = i+1 end
end
if not input_file or not output_file or not timing_output_file then
    io.stderr:write("Usage: luajit main.lua --input <input-file> --output <output-file> --timing-output <timing-file>\n"); os.exit(1) end

local f = open(input_file, "r"); local data = json.decode(f:read("*a")); f:close()
local records_input = data.records

local function kernel(recs)
    sort(recs, function(a, b)
        local sa, sb = a.score, b.score
        if sa ~= sb then return sa > sb end
        local ta, tb = a.timestamp, b.timestamp
        if ta ~= tb then return ta < tb end
        return a.id < b.id
    end)
    local n = #recs
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

local samples = {}; local sn = 0; local output
local kernel_times = {}
for iteration = -warmups, math.huge do
    local recs = {}
    for idx = 1, #records_input do
        local src = records_input[idx]
        recs[idx] = {id=src.id, score=src.score, timestamp=src.timestamp}
    end
    local started = now_ns(); output = kernel(recs)
    local elapsed = math.max(1, math.floor(now_ns() - started + 0.5))
    if iteration >= 0 then
        kernel_times[#kernel_times + 1] = elapsed
        sn = sn + 1
        samples[sn] = {iteration=sn, kernelTimeNanoseconds=elapsed}
        if #kernel_times >= max_iterations or (#kernel_times >= min_iterations and ci_width(kernel_times) <= target_ci) then break end
    end
end
local out = open(output_file, "w"); out:write(json.encode(output)); out:close()
local timing = open(timing_output_file, "w"); timing:write(json.encode({samples=samples})); timing:close()
