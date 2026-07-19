local script_dir = arg[0]:match("(.*[/\\])") or "./"
package.path = script_dir .. "?.lua;" .. package.path

local json = require("json")

local Heap = {}
Heap.__index = Heap

function Heap.new()
    return setmetatable({data = {}}, Heap)
end

function Heap:push(item)
    table.insert(self.data, item)
    local i = #self.data
    while i > 1 do
        local parent = math.floor(i / 2)
        if self.data[parent][1] <= self.data[i][1] then break end
        self.data[parent], self.data[i] = self.data[i], self.data[parent]
        i = parent
    end
end

function Heap:pop()
    local top = self.data[1]
    local last = table.remove(self.data)
    if #self.data > 0 then
        self.data[1] = last
        local i = 1
        while true do
            local smallest = i
            local left = 2 * i
            local right = 2 * i + 1
            if left <= #self.data and self.data[left][1] < self.data[smallest][1] then
                smallest = left
            end
            if right <= #self.data and self.data[right][1] < self.data[smallest][1] then
                smallest = right
            end
            if smallest == i then break end
            self.data[smallest], self.data[i] = self.data[i], self.data[smallest]
            i = smallest
        end
    end
    return top
end

function Heap:empty()
    return #self.data == 0
end

local input_file = nil
local output_file = nil

local i = 1
while i <= #arg do
    if arg[i] == "--input" then
        input_file = arg[i + 1]
        i = i + 2
    elseif arg[i] == "--output" then
        output_file = arg[i + 1]
        i = i + 2
    else
        i = i + 1
    end
end

if not input_file or not output_file then
    io.stderr:write("Usage: luajit main.lua --input <input-file> --output <output-file>\n")
    os.exit(1)
end

local f = io.open(input_file, "r")
local data = json.decode(f:read("*a"))
f:close()

local vertex_count = data.vertexCount
local edges = data.edges
local queries = data.queries

local adjacency = {}
for i = 0, vertex_count - 1 do
    adjacency[i] = {}
end

for _, edge in ipairs(edges) do
    table.insert(adjacency[edge.from], edge)
end

local results = {}

for _, query in ipairs(queries) do
    local source = query.source
    local destination = query.destination

    local distance = {}
    local previous = {}
    for i = 0, vertex_count - 1 do
        distance[i] = math.huge
        previous[i] = -1
    end
    distance[source] = 0

    local heap = Heap.new()
    heap:push({0, source})

    while not heap:empty() do
        local item = heap:pop()
        local cost = item[1]
        local node = item[2]

        if cost == distance[node] then
            for _, edge in ipairs(adjacency[node]) do
                local next_cost = cost + edge.weight
                if next_cost < distance[edge.to] then
                    distance[edge.to] = next_cost
                    previous[edge.to] = node
                    heap:push({next_cost, edge.to})
                end
            end
        end
    end

    if distance[destination] == math.huge then
        table.insert(results, {
            queryId = query.id,
            distance = json.null,
            path = {}
        })
    else
        local path = {}
        local node = destination
        while node ~= -1 do
            table.insert(path, 1, node)
            node = previous[node]
        end

        table.insert(results, {
            queryId = query.id,
            distance = distance[destination],
            path = path
        })
    end
end

local output = {
    benchmark = "shortest-path",
    version = 1,
    results = results
}

local out = io.open(output_file, "w")
out:write(json.encode(output))
out:close()
