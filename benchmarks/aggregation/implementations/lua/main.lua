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
local content = f:read("*a")
f:close()

local record_count = 0
local total_quantity = 0
local total_value_minor_units = 0
local minimum_transaction = math.huge
local maximum_transaction = 0

local categories = {}
local accounts = {}

local first_line = true
for line in content:gmatch("[^\r\n]+") do
    if first_line then
        first_line = false
    else
        local fields = {}
        for field in line:gmatch("[^,]+") do
            table.insert(fields, field)
        end

        if #fields >= 5 then
            local account_id = fields[2]
            local category = fields[3]
            local quantity = tonumber(fields[4])
            local unit_price = tonumber(fields[5])
            local value = quantity * unit_price

            record_count = record_count + 1
            total_quantity = total_quantity + quantity
            total_value_minor_units = total_value_minor_units + value
            if value < minimum_transaction then minimum_transaction = value end
            if value > maximum_transaction then maximum_transaction = value end

            if not categories[category] then
                categories[category] = {quantity = 0, valueMinorUnits = 0}
            end
            categories[category].quantity = categories[category].quantity + quantity
            categories[category].valueMinorUnits = categories[category].valueMinorUnits + value

            if not accounts[account_id] then
                accounts[account_id] = 0
            end
            accounts[account_id] = accounts[account_id] + value
        end
    end
end

local sorted_categories = {}
for cat, data in pairs(categories) do
    table.insert(sorted_categories, {
        category = cat,
        quantity = data.quantity,
        valueMinorUnits = data.valueMinorUnits
    })
end
table.sort(sorted_categories, function(a, b) return a.category < b.category end)

local sorted_accounts = {}
for acc_id, value in pairs(accounts) do
    table.insert(sorted_accounts, {accountId = acc_id, valueMinorUnits = value})
end
table.sort(sorted_accounts, function(a, b)
    if a.valueMinorUnits ~= b.valueMinorUnits then
        return a.valueMinorUnits > b.valueMinorUnits
    end
    return a.accountId < b.accountId
end)

local top_accounts = {}
for idx = 1, math.min(10, #sorted_accounts) do
    table.insert(top_accounts, sorted_accounts[idx])
end

local function encode_category(cat)
    return string.format('{"category":"%s","quantity":%d,"valueMinorUnits":%d}',
        cat.category, cat.quantity, cat.valueMinorUnits)
end

local function encode_account(acc)
    return string.format('{"accountId":"%s","valueMinorUnits":%d}',
        acc.accountId, acc.valueMinorUnits)
end

local cats_json = {}
for _, cat in ipairs(sorted_categories) do
    table.insert(cats_json, encode_category(cat))
end

local accs_json = {}
for _, acc in ipairs(top_accounts) do
    table.insert(accs_json, encode_account(acc))
end

local checksum_input = '{"Categories":[' .. table.concat(cats_json, ",") ..
    '],"TopAccounts":[' .. table.concat(accs_json, ",") .. ']}\n'

local checksum = sha256(checksum_input)

local output = {
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

local out = io.open(output_file, "w")
out:write(json.encode(output))
out:close()
