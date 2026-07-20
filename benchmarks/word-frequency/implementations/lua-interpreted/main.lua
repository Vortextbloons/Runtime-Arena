local script_dir = arg[0]:match("(.*[/\\])") or "./"
local T={0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045}
local huge = math.huge
local floor = math.floor
local min = math.min
local sort = table.sort
local concat = table.concat
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
    return 2 * t * (var / n)^0.5 / mean
end
package.path = script_dir .. "?.lua;" .. package.path

local json = require("json")
local sha256 = require("sha256")
local os_clock = os.clock
local function now_ns()
    return os_clock() * 1e9
end

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
    io.stderr:write("Usage: lua main.lua --input <input-file> --output <output-file>\n"); os.exit(1) end

local f = open(input_file, "r"); local data = json.decode(f:read("*a")); f:close()
local words = data.words

local function kernel(words)
    local freq = {}
    for i = 1, #words do
        local w = words[i]
        local old = freq[w]
        if old then freq[w] = old + 1 else freq[w] = 1 end
    end
    local entries = {}
    local n = 0
    for w, c in pairs(freq) do
        n = n + 1
        entries[n] = {w, c}
    end
    sort(entries, function(a, b)
        local ca, cb = a[2], b[2]
        if ca ~= cb then return ca > cb end
        return a[1] < b[1]
    end)
    local parts = {}
    for i = 1, n do
        local e = entries[i]
        parts[i] = e[1] .. "," .. e[2] .. "\n"
    end
    local checksum = sha256(concat(parts))
    local top = {}
    local top_count = min(10, n)
    for i = 1, top_count do
        local e = entries[i]
        top[i] = {word = e[1], count = e[2]}
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
local kernel_times = {}
for iteration = -warmups, math.huge do
    local started = now_ns(); kernel(words)
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
