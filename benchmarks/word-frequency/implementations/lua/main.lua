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
    io.stderr:write("Usage: luajit main.lua --input <input-file> --output <output-file>\n"); os.exit(1) end

local f = io.open(input_file, "r"); local data = json.decode(f:read("*a")); f:close()
local words = data.words

local function kernel(words)
    local freq = {}
    for i = 1, #words do
        local w = words[i]
        freq[w] = (freq[w] or 0) + 1
    end
    local entries = {}
    local n = 0
    for w, c in pairs(freq) do
        n = n + 1
        entries[n] = {w, c}
    end
    table.sort(entries, function(a, b)
        if a[2] ~= b[2] then return a[2] > b[2] end
        return a[1] < b[1]
    end)
    local parts = {}
    for i = 1, n do
        parts[i] = entries[i][1] .. "," .. entries[i][2] .. "\n"
    end
    local checksum = sha256(table.concat(parts))
    local top = {}
    local top_count = math.min(10, n)
    for i = 1, top_count do
        top[i] = {word = entries[i][1], count = entries[i][2]}
    end
    return {
        benchmark = "word-frequency",
        version = 1,
        totalWords = #words,
        uniqueWords = n,
        topWords = top,
        checksum = checksum,
    }
end

local output = kernel(words)

local samples = {}; local sn = 0
for iteration = -warmups, iterations - 1 do
    local started = now_ns(); kernel(words)
    local elapsed = math.max(1, math.floor(now_ns() - started + 0.5))
    if iteration >= 0 then sn = sn + 1; samples[sn] = {iteration=iteration+1, kernelTimeNanoseconds=elapsed} end
end

local out = io.open(output_file, "w"); out:write(json.encode(output)); out:close()
local timing = io.open(timing_output_file, "w"); timing:write(json.encode({samples=samples})); timing:close()
