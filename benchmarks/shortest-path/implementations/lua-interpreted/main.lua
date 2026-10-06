local script_dir = arg[0]:match("(.*[/\\])") or "./"
local huge = math.huge
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
local vertex_count = data.vertexCount
local n = vertex_count
local edges = data.edges
local queries = data.queries
local Q = #queries

-- Flat CSR, 1-indexed vertices (v+1). offsets[1..n+1].
local degree = {}
for v = 1, n do degree[v] = 0 end
for ei = 1, #edges do degree[edges[ei].from + 1] = degree[edges[ei].from + 1] + 1 end
local offsets = {}
offsets[1] = 1
for v = 1, n do offsets[v + 1] = offsets[v] + degree[v] end
local E = #edges
local dst, wgt = {}, {}
do
    local fill = {}
    for v = 1, n do fill[v] = offsets[v] end
    for ei = 1, E do
        local e = edges[ei]
        local s = fill[e.from + 1]; fill[e.from + 1] = s + 1
        dst[s] = e.to + 1; wgt[s] = e.weight
    end
end

local qsrc, qdst, qid = {}, {}, {}
for i = 1, Q do
    local q = queries[i]
    qsrc[i] = q.source + 1; qdst[i] = q.destination + 1; qid[i] = q.id
end

-- Group query indices by source (preserve first-seen order)
local groups, gmembers = {}, {}
local gindex = {}
for i = 1, Q do
    local s = qsrc[i]
    local gi = gindex[s]
    if not gi then gi = #groups + 1; groups[gi] = s; gmembers[gi] = {}; gindex[s] = gi end
    gmembers[gi][#gmembers[gi] + 1] = i
end

local dist, prev, seen, tmark = {}, {}, {}, {}
for v = 1, n do dist[v] = huge; seen[v] = 0; tmark[v] = 0 end
local epoch, tepoch = 0, 0

-- Reused binary heap (1-indexed arrays)
local hc, hn = {}, {}
local hsize = 0
local function hpush(cost, node)
    hsize = hsize + 1
    local i = hsize
    while i > 1 do
        local p = i >> 1
        if hc[p] <= cost then break end
        hc[i] = hc[p]; hn[i] = hn[p]; i = p
    end
    hc[i] = cost; hn[i] = node
end
local function hpop()
    local topc, topn = hc[1], hn[1]
    local lc, ln = hc[hsize], hn[hsize]
    hsize = hsize - 1
    local i = 1
    while true do
        local l = i + i
        if l > hsize then break end
        local r = l + 1
        local s = l
        if r <= hsize and hc[r] < hc[l] then s = r end
        if hc[s] >= lc then break end
        hc[i] = hc[s]; hn[i] = hn[s]; i = s
    end
    hc[i] = lc; hn[i] = ln
    return topc, topn
end

local function kernel()
    local odist, opath = {}, {}
    for gi = 1, #groups do
        local src = groups[gi]
        local members = gmembers[gi]
        epoch = epoch + 1
        local cur = epoch
        tepoch = tepoch + 1
        local tc = tepoch
        local rem = 0
        for k = 1, #members do
            local d = qdst[members[k]]
            if d ~= src and tmark[d] ~= tc then tmark[d] = tc; rem = rem + 1 end
        end
        dist[src] = 0; seen[src] = cur; prev[src] = -1
        hsize = 0
        hpush(0, src)
        while hsize > 0 and rem > 0 do
            local cost, node = hpop()
            if seen[node] == cur and cost == dist[node] then
                if tmark[node] == tc then
                    tmark[node] = -tc
                    rem = rem - 1
                    if rem == 0 then break end
                end
                local base, bend = offsets[node], offsets[node + 1] - 1
                for ei = base, bend do
                    local to = dst[ei]
                    local nc = cost + wgt[ei]
                    if seen[to] ~= cur or nc < dist[to] then
                        seen[to] = cur; dist[to] = nc; prev[to] = node
                        hpush(nc, to)
                    end
                end
            end
        end
        for k = 1, #members do
            local i = members[k]
            local d = qdst[i]
            if d == src then
                odist[i] = 0; opath[i] = {src - 1}
            elseif seen[d] ~= cur then
                odist[i] = json.null; opath[i] = {}
            else
                odist[i] = dist[d]
                local rev = {}
                local rn = 0
                local x = d
                while true do rn = rn + 1; rev[rn] = x - 1; if x == src then break end; x = prev[x] end
                local pn = rn
                local path = {}
                for ii = 1, pn do path[ii] = rev[pn - ii + 1] end
                opath[i] = path
            end
        end
    end
    local results = {}
    for i = 1, Q do results[i] = {queryId = qid[i], distance = odist[i], path = opath[i]} end
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
