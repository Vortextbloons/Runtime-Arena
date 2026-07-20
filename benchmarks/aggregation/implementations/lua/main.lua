local script_dir = arg[0]:match("(.*[/\\])") or "./"
local huge = math.huge
local min = math.min
local sort = table.sort
local concat = table.concat
local format = string.format
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

local f = open(input_file, "r")
local content = f:read("*a")
f:close()

local rows = {}
local first_line = true
for line in content:gmatch("[^\r\n]+") do
    if first_line then first_line = false else
        local fields = {}
        for field in line:gmatch("[^,]+") do fields[#fields+1] = field end
        if #fields >= 5 then rows[#rows+1] = {fields[2],fields[3],tonumber(fields[4]),tonumber(fields[5])} end
    end
end

local function kernel()
local record_count = 0
local total_quantity = 0
local total_value_minor_units = 0
local minimum_transaction = huge
local maximum_transaction = 0

local categories = {}
local accounts = {}

local row_count = #rows
for ri = 1, row_count do
            local fields = rows[ri]
            local account_id = fields[1]
            local category = fields[2]
            local quantity = fields[3]
            local unit_price = fields[4]
            local value = quantity * unit_price

            record_count = record_count + 1
            total_quantity = total_quantity + quantity
            total_value_minor_units = total_value_minor_units + value
            if value < minimum_transaction then minimum_transaction = value end
            if value > maximum_transaction then maximum_transaction = value end

            local cat = categories[category]
            if not cat then
                cat = {quantity = 0, valueMinorUnits = 0}
                categories[category] = cat
            end
            cat.quantity = cat.quantity + quantity
            cat.valueMinorUnits = cat.valueMinorUnits + value

            local acc = accounts[account_id]
            if not acc then
                accounts[account_id] = value
            else
                accounts[account_id] = acc + value
            end
end

local sorted_categories = {}
local sc_n = 0
for cat, data in pairs(categories) do
    sc_n = sc_n + 1
    sorted_categories[sc_n] = {
        category = cat,
        quantity = data.quantity,
        valueMinorUnits = data.valueMinorUnits
    }
end
sort(sorted_categories, function(a, b) return a.category < b.category end)

local sorted_accounts = {}
local sa_n = 0
for acc_id, value in pairs(accounts) do
    sa_n = sa_n + 1
    sorted_accounts[sa_n] = {accountId = acc_id, valueMinorUnits = value}
end
sort(sorted_accounts, function(a, b)
    if a.valueMinorUnits ~= b.valueMinorUnits then
        return a.valueMinorUnits > b.valueMinorUnits
    end
    return a.accountId < b.accountId
end)

local top_accounts = {}
local top_n = min(10, #sorted_accounts)
for idx = 1, top_n do
    top_accounts[idx] = sorted_accounts[idx]
end

local cats_json = {}
for ci = 1, sc_n do
    local cat = sorted_categories[ci]
    cats_json[ci] = format('{"category":"%s","quantity":%d,"valueMinorUnits":%d}',
        cat.category, cat.quantity, cat.valueMinorUnits)
end

local accs_json = {}
for ai = 1, top_n do
    local acc = top_accounts[ai]
    accs_json[ai] = format('{"accountId":"%s","valueMinorUnits":%d}',
        acc.accountId, acc.valueMinorUnits)
end

local checksum_input = '{"Categories":[' .. concat(cats_json, ",") ..
    '],"TopAccounts":[' .. concat(accs_json, ",") .. ']}\n'

local checksum = sha256(checksum_input)

return {
    benchmark = "aggregation",
    version = 1,
    recordCount = record_count,
    totalQuantity = total_quantity,
    totalValueMinorUnits = total_value_minor_units,
    categories = sorted_categories,
    topAccounts = top_accounts,
    minimumTransactionMinorUnits = minimum_transaction,
    maximumTransactionMinorUnits = maximum_transaction,
    checksum = checksum
}
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
