local script_dir = arg[0]:match("(.*[/\\])") or "./"
local huge = math.huge
local open = io.open
local bit = require("bit")
local rshift = bit.rshift
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
    io.stderr:write("Usage: luajit main.lua --input <input-file> --output <output-file> --protocol-version 2.0.0\n")
    os.exit(1)
end

local function respond(obj)
    io.write(json.encode(obj), "\n")
    io.flush()
end

local function digest_output(output)
    return sha256(json.encode(output))
end

local Heap = {}
Heap.__index = Heap
function Heap.new() return setmetatable({costs = {}, nodes = {}, size = 0}, Heap) end
function Heap:push(cost, node)
    local costs = self.costs
    local nodes = self.nodes
    local s = self.size + 1; self.size = s
    costs[s] = cost; nodes[s] = node
    while s > 1 do local p = rshift(s, 1)
        if costs[p] <= costs[s] then break end
        costs[p], costs[s] = costs[s], costs[p]
        nodes[p], nodes[s] = nodes[s], nodes[p]; s = p end
end
function Heap:pop()
    local costs = self.costs
    local nodes = self.nodes
    local top_cost, top_node = costs[1], nodes[1]
    local s = self.size
    if s == 1 then self.size = 0; return top_cost, top_node end
    local last = s; self.size = s - 1
    costs[1] = costs[last]; nodes[1] = nodes[last]
    local i = 1
    while true do local sc = i; local l = 2*i; local r = l + 1
        if l <= self.size and costs[l] < costs[sc] then sc = l end
        if r <= self.size and costs[r] < costs[sc] then sc = r end
        if sc == i then break end
        costs[sc], costs[i] = costs[i], costs[sc]
        nodes[sc], nodes[i] = nodes[i], nodes[sc]; i = sc end
    return top_cost, top_node
end
function Heap:empty() return self.size == 0 end

local f = open(input_file, "r"); local data = json.decode(f:read("*a")); f:close()
local vertex_count = data.vertexCount; local edges = data.edges; local queries = data.queries

local adjacency = {}
for vi = 0, vertex_count - 1 do adjacency[vi] = {} end
local edge_count = #edges
for ei = 1, edge_count do local edge = edges[ei]; local adj = adjacency[edge.from]; adj[#adj+1] = edge end

local function kernel()
local results = {}
local rn = 0
local query_count = #queries
local vc = vertex_count
for qi = 1, query_count do
    local query = queries[qi]
    local source, destination = query.source, query.destination
    local distance, previous = {}, {}
    for vi = 0, vc - 1 do distance[vi] = huge; previous[vi] = -1 end
    distance[source] = 0
    local heap = Heap.new(); heap:push(0, source)
    while not heap:empty() do
        local cost, node = heap:pop()
        if cost == distance[node] then
            if node == destination then break end
            local adj = adjacency[node]
            for ei = 1, #adj do
                local edge = adj[ei]
                local nc = cost + edge.weight
                local to = edge.to
                if nc < distance[to] then
                    distance[to] = nc; previous[to] = node; heap:push(nc, to) end end end end
    if distance[destination] == huge then
        rn = rn + 1; results[rn] = {queryId = query.id, distance = json.null, path = {}}
    else
        local path = {}; local nd = destination; local pn = 0
        while nd ~= -1 do pn = pn + 1; path[pn] = nd; nd = previous[nd] end
        for ii = 1, rshift(pn, 1) do local j = pn - ii + 1; path[ii], path[j] = path[j], path[ii] end
        rn = rn + 1; results[rn] = {queryId = query.id, distance = distance[destination], path = path} end end
return {benchmark = "shortest-path", version = 1, results = results}
end

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
