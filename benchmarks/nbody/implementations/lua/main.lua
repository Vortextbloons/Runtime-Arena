local script_dir = arg[0]:match("(.*[/\\])") or "./"
package.path = script_dir .. "?.lua;" .. package.path

local json = require("json")
local sha256 = require("sha256")

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

local steps = data.steps
local delta_time = data.deltaTime
local bodies = data.bodies

local b = {}
for idx = 1, #bodies do
    b[idx] = {
        mass = bodies[idx].mass,
        position = {bodies[idx].position[1], bodies[idx].position[2], bodies[idx].position[3]},
        velocity = {bodies[idx].velocity[1], bodies[idx].velocity[2], bodies[idx].velocity[3]}
    }
end

local body_count = #b

for step = 1, steps do
    for i = 1, body_count do
        for j = i + 1, body_count do
            local dx = b[j].position[1] - b[i].position[1]
            local dy = b[j].position[2] - b[i].position[2]
            local dz = b[j].position[3] - b[i].position[3]
            local r2 = dx*dx + dy*dy + dz*dz
            local magnitude = delta_time / (r2 * math.sqrt(r2))
            b[i].velocity[1] = b[i].velocity[1] + dx * b[j].mass * magnitude
            b[i].velocity[2] = b[i].velocity[2] + dy * b[j].mass * magnitude
            b[i].velocity[3] = b[i].velocity[3] + dz * b[j].mass * magnitude
            b[j].velocity[1] = b[j].velocity[1] - dx * b[i].mass * magnitude
            b[j].velocity[2] = b[j].velocity[2] - dy * b[i].mass * magnitude
            b[j].velocity[3] = b[j].velocity[3] - dz * b[i].mass * magnitude
        end
    end

    for i = 1, body_count do
        b[i].position[1] = b[i].position[1] + delta_time * b[i].velocity[1]
        b[i].position[2] = b[i].position[2] + delta_time * b[i].velocity[2]
        b[i].position[3] = b[i].position[3] + delta_time * b[i].velocity[3]
    end
end

local energy = 0.0
for i = 1, body_count do
    local v2 = b[i].velocity[1]^2 + b[i].velocity[2]^2 + b[i].velocity[3]^2
    energy = energy + 0.5 * b[i].mass * v2
    for j = i + 1, body_count do
        local dx = b[i].position[1] - b[j].position[1]
        local dy = b[i].position[2] - b[j].position[2]
        local dz = b[i].position[3] - b[j].position[3]
        local r2 = dx*dx + dy*dy + dz*dz
        energy = energy - b[i].mass * b[j].mass / math.sqrt(r2)
    end
end

local position_data = ""
local velocity_data = ""
for i = 1, body_count do
    for k = 1, 3 do
        position_data = position_data .. string.format("%.9f,", b[i].position[k])
        velocity_data = velocity_data .. string.format("%.9f,", b[i].velocity[k])
    end
end

local position_checksum = sha256(position_data)
local velocity_checksum = sha256(velocity_data)

local output = {
    benchmark = "nbody",
    version = 1,
    bodyCount = body_count,
    finalEnergy = energy,
    positionChecksum = position_checksum,
    velocityChecksum = velocity_checksum
}

local out = io.open(output_file, "w")
out:write(json.encode(output))
out:close()
