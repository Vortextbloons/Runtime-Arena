local script_dir = arg[0]:match("(.*[/\\])") or "./"
local T={0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045}
local function ci_width(samples)
    local n = #samples
    if n < 2 then return math.huge end
    local sum = 0
    for i = 1, n do sum = sum + samples[i] end
    local mean = sum / n
    if mean <= 0 then return math.huge end
    local var = 0
    for i = 1, n do local d = samples[i] - mean; var = var + d * d end
    var = var / (n - 1)
    local t = T[n + 1] or 2
    return 2 * t * math.sqrt(var / n) / mean
end
package.path = script_dir .. "?.lua;" .. package.path

local json = require("json")
local ffi = require("ffi")
ffi.cdef[[typedef long long LARGE_INTEGER; int QueryPerformanceCounter(LARGE_INTEGER*); int QueryPerformanceFrequency(LARGE_INTEGER*);]]
local counter, frequency = ffi.new("LARGE_INTEGER[1]"), ffi.new("LARGE_INTEGER[1]")
ffi.C.QueryPerformanceFrequency(frequency)
local function now_ns() ffi.C.QueryPerformanceCounter(counter); return tonumber(counter[0]) * 1000000000 / tonumber(frequency[0]) end

local Heap = {}
Heap.__index = Heap
function Heap.new() return setmetatable({costs = {}, nodes = {}, size = 0}, Heap) end
function Heap:push(cost, node)
    local s = self.size + 1; self.size = s
    self.costs[s] = cost; self.nodes[s] = node
    while s > 1 do local p = math.floor(s / 2)
        if self.costs[p] <= self.costs[s] then break end
        self.costs[p], self.costs[s] = self.costs[s], self.costs[p]
        self.nodes[p], self.nodes[s] = self.nodes[s], self.nodes[p]; s = p end
end
function Heap:pop()
    local top_cost, top_node = self.costs[1], self.nodes[1]
    local s = self.size
    if s == 1 then self.size = 0; return top_cost, top_node end
    local last = s; self.size = s - 1
    self.costs[1] = self.costs[last]; self.nodes[1] = self.nodes[last]
    local i = 1
    while true do local sc = i; local l = 2*i; local r = 2*i+1
        if l <= self.size and self.costs[l] < self.costs[sc] then sc = l end
        if r <= self.size and self.costs[r] < self.costs[sc] then sc = r end
        if sc == i then break end
        self.costs[sc], self.costs[i] = self.costs[i], self.costs[sc]
        self.nodes[sc], self.nodes[i] = self.nodes[i], self.nodes[sc]; i = sc end
    return top_cost, top_node
end
function Heap:empty() return self.size == 0 end

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
    io.stderr:write("Usage: luajit main.lua --input <input-file> --output <output-file>\n"); os.exit(1) end

local f = io.open(input_file, "r"); local data = json.decode(f:read("*a")); f:close()
local vertex_count = data.vertexCount; local edges = data.edges; local queries = data.queries

local adjacency = {}
for i = 0, vertex_count - 1 do adjacency[i] = {} end
local edge_count = #edges
for ei = 1, edge_count do local edge = edges[ei]; local adj = adjacency[edge.from]; adj[#adj+1] = edge end

local function kernel()
local results = {}
local rn = 0
local query_count = #queries
for qi = 1, query_count do
    local query = queries[qi]
    local source, destination = query.source, query.destination
    local distance, previous = {}, {}
    for vi = 0, vertex_count - 1 do distance[vi] = math.huge; previous[vi] = -1 end
    distance[source] = 0
    local heap = Heap.new(); heap:push(0, source)
    while not heap:empty() do
        local cost, node = heap:pop()
        if cost == distance[node] then
            local adj = adjacency[node]
            for ei = 1, #adj do
                local edge = adj[ei]
                local nc = cost + edge.weight
                if nc < distance[edge.to] then
                    distance[edge.to] = nc; previous[edge.to] = node; heap:push(nc, edge.to) end end end end
    if distance[destination] == math.huge then
        rn = rn + 1; results[rn] = {queryId = query.id, distance = json.null, path = {}}
    else
        local path = {}; local nd = destination; local pn = 0
        while nd ~= -1 do pn = pn + 1; path[pn] = nd; nd = previous[nd] end
        for i = 1, math.floor(pn/2) do path[i], path[pn-i+1] = path[pn-i+1], path[i] end
        rn = rn + 1; results[rn] = {queryId = query.id, distance = distance[destination], path = path} end end
return results end

local samples = {}; local sn = 0; local results
local kernel_times = {}
for iteration = -warmups, math.huge do
    local started = now_ns(); results = kernel()
    local elapsed = math.max(1, math.floor(now_ns() - started + 0.5))
    if iteration >= 0 then
        kernel_times[#kernel_times + 1] = elapsed
        sn = sn + 1
        samples[sn] = {iteration=sn, kernelTimeNanoseconds=elapsed}
        if #kernel_times >= max_iterations or (#kernel_times >= min_iterations and ci_width(kernel_times) <= target_ci) then break end
    end end
local output = {benchmark="shortest-path", version=1, results=results}
local out = io.open(output_file, "w"); out:write(json.encode(output)); out:close()
local timing = io.open(timing_output_file, "w"); timing:write(json.encode({samples=samples})); timing:close()
