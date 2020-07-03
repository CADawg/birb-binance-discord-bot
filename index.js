require('dotenv').config();
const Discord = require('discord.js');
const Binance = require('binance-api-node').default;
const Table = require('ascii-art-table');
const discordClient = new Discord.Client();
const binanceClient = new Binance({
    apiKey: process.env.BINANCE_APIKEY,
    apiSecret: process.env.BINANCE_APISECRET
});
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json');
const db = low(adapter);

db.defaults({
    sellInfo: []
}).write();

function toSmallestNumberWithSameSF(number_from) {
    let number_length = Math.ceil(number_from).toString().length;
    let number_string = "1" + ("0".repeat(number_length - 1));
    return Number(number_string);
}

function joinWithToFixed(arr, delimiter) {
    let str = "";
    let last = false;
    for (let idx in arr) {
        if (arr.hasOwnProperty(idx)) {
            let tmp_rep = arr[idx].toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
            if (last) {
                str += delimiter + tmp_rep;
            } else {
                str += tmp_rep;
            }
            last = true;
        }
    }
    return str;
}

let last_read_birb_trade = null;
let last_ready_trade = null;

discordClient.on('ready', async () => {
    console.log(`Logged in as ${discordClient.user.tag}!`);
    discordClient.user.setActivity("all the Cryptos!",{ type: 'WATCHING' });

    let cancel = setInterval(async () => {
        // Run every 10 minutes
        let records = db.get("sellInfo").value();

        const loggingChannel = discordClient.channels.cache.get("728589082049118278"); // #loggging
        const userToPing = discordClient.users.cache.get("160888334195884032"); // CADawg

        let rejected = false;
        let account_info = await binanceClient.accountInfo().catch(reason => {rejected = true;});
        if (rejected) return;
        let balances = {};
        for (i = 0; i < account_info.balances.length; i++) {
            let this_bal = account_info.balances[i];
            if ((+this_bal.free) + (+this_bal.locked) > 0) {
                balances[this_bal.asset] = {free: this_bal.free, locked: this_bal.locked};
            }
        }

        let cryptoWatching = "";

        for (let idx in records) {
            if (records.hasOwnProperty(idx)) {
                let trade = records[idx];

                let balance_symbol = "";
                if (trade["split_symbol"] !== false) {
                    balance_symbol = trade["split_symbol"][0];
                } else {
                    balance_symbol = trade["symbol"].substr(0,3);
                }

                if (cryptoWatching !== "") cryptoWatching += " / ";
                cryptoWatching += balance_symbol;

                discordClient.user.setActivity(cryptoWatching,{ type: 'WATCHING' });

                let current_balance = 0;
                if (balance_symbol in balances) {
                    if (balances[balance_symbol].free > 0) {
                        current_balance = balances[balance_symbol].free;
                    }



                    if ((balances[balance_symbol].free + balances[balance_symbol].locked) === 0) {
                        // trade finished, unless we have buy orders

                        let oo_reject = false;
                        let open_orders = await binanceClient.openOrders({symbol: trade["symbol"]}).catch(reason => {msg.channel.send("Couldn't get orders :("); oo_reject = true;});
                        if (oo_reject) continue;

                        if (open_orders.length === 0) {
                            db.get("sellInfo").remove(trade).write(); // Remove trade, as we're done.
                            continue;
                        }
                    }
                }

                if (current_balance > 0) {
                    loggingChannel.send(`${userToPing}, We have more \`` + trade["symbol"] + "` to sell! Selling:");
                    loggingChannel.send("!birbsell " + JSON.stringify(trade));
                }
            }
        }
    }, 600000);
});

discordClient.on('message', async msg => {
    if (msg.author.id === "160888334195884032" || msg.author.id === "726897075534430209") {
        if (msg.content.startsWith('!orders')) {
            let message_content_split = msg.content.split(/[ ,]+/);
            let tradeInfo = [];
            if (message_content_split.length >= 2) {
                tradeInfo = await binanceClient.openOrders({symbol: message_content_split[1].toUpperCase()}).catch(reason => msg.channel.send("Lookup Failed: `" + reason.toString() + "`"));
            } else {
                tradeInfo = await binanceClient.openOrders({symbol: 'ETHBTC'});
            }

            if (tradeInfo === null || tradeInfo === undefined) {
                return;
            }
            if (tradeInfo.length < 1) {
                msg.channel.send("`No active trades in the given pairs!`");
                return;
            }

            let tradesData = [];

            for (i = 0; i < tradeInfo.length; i++) {
                let thisTrade = tradeInfo[i];
                tradesData.push({
                    "Symbol": thisTrade.symbol,
                    "Side": thisTrade.side,
                    "Order ID": thisTrade.orderId.toString(),
                    "Price": (+thisTrade.price).toFixed(8).replace(/0+$/, '').replace(/\.$/, ''),
                    "Total Qty": (+thisTrade.origQty).toString(),
                    "Executed Qty": (+thisTrade.executedQty).toString(),
                    "Status": thisTrade.status === "NEW" ? "UNFILLED" : thisTrade.status,
                    "Time Active": thisTrade.timeInForce === "GTC" ? "FOREVER" : thisTrade.timeInForce,
                    "Order Type": thisTrade.type,
                    "Stop Price": (+thisTrade.stopPrice) === 0 ? " " : (+thisTrade.stopPrice).toFixed(8).replace(/0+$/, '').replace(/\.$/, '')
                });
            }

            msg.channel.send("```\n" + await Table.create({
                width: 120,
                includeHeader: true,
                columns: ["Symbol", "Side", "Order ID", "Price", "Total Qty", "Executed Qty", "Status", "Time Active", "Order Type", "Stop Price"],
                data: tradesData
            }) + "```");
        } else if (msg.content.startsWith('!bal')) {
            let account_info = await binanceClient.accountInfo();
            let balances = [];
            for (i = 0; i < account_info.balances.length; i++) {
                let this_bal = account_info.balances[i];
                if ((+this_bal.free) + (+this_bal.locked) > 0) {
                    balances.push({"Asset": this_bal.asset, "Free": this_bal.free, "Locked": this_bal.locked});
                }
            }

            msg.channel.send("```\n" + await Table.create({
                width: 120,
                includeHeader: true,
                columns: ["Asset", "Free", "Locked"],
                data: balances
            }) + "```");
        } else if (msg.content.startsWith('!birb') && !msg.content.startsWith("!birbtrade") && !msg.content.startsWith("!birbsell")) {
            let message_lines = msg.content.split("\n");
            let is_parsing = false;
            let next_line = "";
            let birb_data = {"symbol": "", "split_symbol": [], "buy_range": [], "take_profit": [], "stop_loss": 0, "already_no": false};
            for (let line_number in message_lines) {
                let line = message_lines[line_number];
                if (line.startsWith("```")) {
                    is_parsing = !is_parsing;
                }

                if (is_parsing && line !== "") {
                    if (line.toLowerCase().startsWith("call title")) {
                        next_line = "symbol";
                    } else if (line.toLowerCase().startsWith("call structure")) {
                        next_line = "structure";
                    } else {
                        if (next_line === "symbol") {
                            next_line = false;
                            let unclean_symbol = line.split(" ")[0];
                            let symbol_elements = unclean_symbol.toUpperCase().split("/");
                            if (symbol_elements.length === 2) {
                                birb_data.symbol = symbol_elements.join("");
                                birb_data.split_symbol = [symbol_elements[0], symbol_elements[1]];
                                //if (["BTC","USD"].includes(symbol_elements[0])) {
                                //    birb_data.symbol = symbol_elements.join("");
                                //} else {
                                //    symbol_elements.reverse();
                                //    birb_data.symbol = symbol_elements.join("");
                                //}
                            } else {
                                birb_data.symbol = symbol_elements.join("") + "BTC";
                                birb_data.split_symbol = [symbol_elements.join(""), "BTC"];
                            }
                        } else if (next_line === "structure") {
                            if (line.toLowerCase().startsWith("sell")) {
                                msg.channel.send("Can't process, as it is a SHORT order. I only understand LONG orders!");
                                return;
                            }

                            if (line.toLowerCase().startsWith("buy")) {
                                let split_line = line.split(/[ \-]/);
                                for (let item_no in split_line) {
                                    let part = split_line[item_no];
                                    if (!isNaN(part) && part !== "" && part !== " ") {
                                        birb_data.buy_range.push(Number(part));
                                    }
                                }
                            } else if (line.toLowerCase().startsWith("tp")) {
                                let split_line = line.split(/[ \/]/);
                                for (let item_no in split_line) {
                                    let part = split_line[item_no];
                                    if (!isNaN(part) && part !== "" && part !== " ") {
                                        birb_data.take_profit.push(Number(part));
                                    }
                                }
                            } else if (line.toLowerCase().startsWith("sl")) {
                                let split_line = line.split(/[ \/]/);
                                for (let item_no in split_line) {
                                    let part = split_line[item_no];
                                    if (!isNaN(part) && part !== "" && part !== " ") {
                                        if (birb_data.stop_loss === 0) {
                                            birb_data.stop_loss = Number(part);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            msg.channel.send("Success! I've read the data. Here's what I understood: \n```\n" +
                "Symbol: " + birb_data.symbol + "\n" +
                "Buy Range: " + joinWithToFixed(birb_data.buy_range," - ") + "\n" +
                "Take Profit: " + joinWithToFixed(birb_data.take_profit, " / ") + "\n" +
                "Stop Loss: " + birb_data.stop_loss.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') + "\n" +
                "```\n" +
                "Am I right? `!yes` to confirm, `!no` to correct."
            );
            last_read_birb_trade = birb_data;
        } else if (msg.content.startsWith('!yes')) {
            if (last_read_birb_trade !== null) {
                msg.channel.send("Trade to execute: \n```\n" +
                    "Symbol: " + last_read_birb_trade.symbol + "\n" +
                    "Buy Range: " + joinWithToFixed(last_read_birb_trade.buy_range," - ") + "\n" +
                    "Take Profit: " + joinWithToFixed(last_read_birb_trade.take_profit, " / ") + "\n" +
                    "Stop Loss: " + last_read_birb_trade.stop_loss.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') + "\n" +
                    "```\n" +
                    "Run `!realify` to turn this trade into using real values!"
                );
            } else {
                msg.channel.send("Error: No Trade Info Specified!")
            }
        } else if (msg.content.startsWith('!no')) {
            if (last_read_birb_trade !== null) {
                if (last_read_birb_trade.already_no === true) {
                    last_read_birb_trade = null;
                    msg.channel.send("I've deleted the trade for you!");
                    return;
                }
                last_read_birb_trade.already_no = true;
                msg.channel.send("What do you want to correct?\n```\nChange Symbol: !symbol SYM/BOL\nChange Buy Range: !buyrange n1-n2\nChange Take Profit: !takeprofit n1,n2,...\nChange Stop Loss: !stoploss n1\nCancel Completely: !no\nView Trade Data: !birbtrade\nDone? !yes\n```")
            } else {
                msg.channel.send("Error: No Trade Info Specified!")
            }
        } else if (msg.content.startsWith("!symbol")) {
            if (last_read_birb_trade !== null) {
                let split_command = msg.content.split(" ");
                if (split_command.length === 2) {
                    last_read_birb_trade.symbol = split_command[1].toUpperCase();
                    last_read_birb_trade.split_symbol = split_command[1].split("/");
                    msg.channel.send("Symbol Set: `" + last_read_birb_trade.symbol + "`");
                } else {
                    msg.channel.send("No symbol was specified, so no changes were made!");
                }
            } else {
                msg.channel.send("Error: No Trade Set!")
            }
        } else if (msg.content.startsWith("!buyrange")) {
            if (last_read_birb_trade !== null) {
                let split_command = msg.content.split(" ");
                if (split_command.length === 2) {
                    let range = split_command[1].split("-");
                    if (range.length === 2 && !isNaN(range[0]) && !isNaN(range[1])) {
                        last_read_birb_trade.buy_range = range;
                        msg.channel.send("Range Set: `" + last_read_birb_trade.buy_range.join(" - ") + "`");
                    } else {
                        msg.channel.send("Invalid range. Please Try Again!");
                    }
                } else {
                    msg.channel.send("No range was specified, so no changes were made!");
                }
            } else {
                msg.channel.send("Error: No Trade Set!")
            }
        } else if (msg.content.startsWith("!takeprofit")) {
            if (last_read_birb_trade !== null) {
                let split_command = msg.content.split(" ");
                if (split_command.length === 2) {
                    let range = split_command[1].split(",");
                    let range_valid = true;
                    for (let n in range) {
                        if (isNaN(range[n])) range_valid = false;
                    }
                    if (range.length >= 1 && range_valid) {
                        last_read_birb_trade.take_profit = range;
                        msg.channel.send("TPs Set: `" + last_read_birb_trade.take_profit.join(" / ") + "`");
                    } else {
                        msg.channel.send("Invalid TP. Please Try Again!");
                    }
                } else {
                    msg.channel.send("No TP was specified, so no changes were made!");
                }
            } else {
                msg.channel.send("Error: No Trade Set!")
            }
        } else if (msg.content.startsWith("!stoploss")) {
            if (last_read_birb_trade !== null) {
                let split_command = msg.content.split(" ");
                if (split_command.length === 2) {
                    if (!isNaN(split_command[1])) {
                        last_read_birb_trade.stop_loss = Number(split_command[1]);
                        msg.channel.send("SL Set: `" + last_read_birb_trade.buy_range.join(" - ") + "`");
                    } else {
                        msg.channel.send("Invalid SL. Please Try Again!");
                    }
                } else {
                    msg.channel.send("No SL was specified, so no changes were made!");
                }
            } else {
                msg.channel.send("Error: No Trade Set!")
            }
        } else if (msg.content.startsWith("!birbtrade")) {
            if (last_read_birb_trade !== null) {
                msg.channel.send("Current Trade Idea: \n```\n" +
                    "Symbol: " + last_read_birb_trade.symbol + "\n" +
                    "Buy Range: " + joinWithToFixed(last_read_birb_trade.buy_range," - ") + "\n" +
                    "Take Profit: " + joinWithToFixed(last_read_birb_trade.take_profit, " / ") + "\n" +
                    "Stop Loss: " + last_read_birb_trade.stop_loss.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') + "\n" +
                    "```"
                );
            } else {
                msg.channel.send("Error: No Trade Set!")
            }
        } else if (msg.content.startsWith("!realify")) {
            if (last_read_birb_trade !== null) {
                msg.channel.send("Converting, please wait! After this, you won't be able to change the trade using the previous commands.");
                if (last_read_birb_trade.symbol !== "" && last_read_birb_trade.take_profit !== [] && last_read_birb_trade.buy_range.length === 2 && last_read_birb_trade.stop_loss !== 0) {
                    let price_read = true;
                    let avg_price = await binanceClient.avgPrice({symbol: last_read_birb_trade.symbol}).catch(reason => {
                        msg.channel.send("Conversion Error while fetching current price: `" + reason.toString() + "`");
                        price_read = false;
                    });
                    if (!price_read) return;

                    avg_price = Number.parseFloat(avg_price.price);

                    let start_price = Number(avg_price);
                    let divide_by = 0;
                    while (start_price < toSmallestNumberWithSameSF(last_read_birb_trade.buy_range[0])) {
                        start_price *= 10;
                        divide_by++;
                    }

                    let realistic_data = {};

                    // algo for making 5 different price points
                    let lowx = last_read_birb_trade.buy_range[0];
                    let highx = last_read_birb_trade.buy_range[1];
                    let midx = Math.floor((lowx + highx) / 2);
                    let diffx = lowx > highx ? lowx - highx : highx - lowx;
                    let midhighx = midx + (Math.ceil(diffx / 4));
                    let midlowx = midx - (Math.floor(diffx / 4));
                    realistic_data.buy_points = [lowx / (10 ** divide_by), midlowx / (10 ** divide_by), midx / (10 ** divide_by), midhighx / (10 ** divide_by), highx / (10 ** divide_by)];

                    realistic_data.stop_loss = last_read_birb_trade.stop_loss / (10 ** divide_by);

                    realistic_data.take_profit = [];
                    for (let idx in last_read_birb_trade.take_profit) {
                        realistic_data.take_profit.push(last_read_birb_trade.take_profit[idx] / (10 ** divide_by));
                    }

                    realistic_data.symbol = last_read_birb_trade.symbol;
                    realistic_data.split_symbol = last_read_birb_trade.split_symbol || false;

                    last_read_birb_trade = null;
                    last_ready_trade = realistic_data;

                    msg.channel.send("Realistic Trade Data: \n" +
                        "```\n" +
                        "Symbol: " + realistic_data.symbol + "\n" +
                        "Buy Points: " + joinWithToFixed(realistic_data.buy_points, " / ") + "\n" +
                        "Take Profit: " + joinWithToFixed(realistic_data.take_profit, " / ") + "\n" +
                        "Stop Loss: " + realistic_data.stop_loss.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') + "\n" +
                        " ----------- \n" +
                        "Reference Data: \n" +
                        "Current Price: " + avg_price.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') + "\n" +
                        " ----------- \n" +
                        "```\n" +
                        "Ready? Run `!xcqtbuy [amount to spend]` (Execute Buy) to Set the Limit Purchase Orders. \n" +
                        "After this, we'll send you a code to enter when you have bought the token so that you can sell it!"
                    )
                } else {
                    msg.channel.send("Trade missing important info!");
                }
            } else {
                msg.channel.send("No trade to be converted to real order available!")
            }
        } else if (msg.content.startsWith("!cancelall") || msg.content.startsWith("!cancellall")) {
            let split_command = msg.content.split(" ");
            if (split_command.length === 2) {
                await binanceClient.cancelOpenOrders({symbol: split_command[1].toUpperCase()})
                    .then(() => {
                        msg.channel.send("Successfully Cancelled all `" + split_command[1].toUpperCase() + "` orders!")
                    })
                    .catch(reason => {
                        msg.channel.send("Error Cancelling Orders: `" + reason.toString() + "`")
                    });
            } else {
                msg.channel.send("No symbol specified!");
            }
        } else if (msg.content.startsWith("!xcqtbuy")) {
            let split_command = msg.content.split(" ");
            if (split_command.length === 2) {
                if (isNaN(split_command[1])) {msg.channel.send("Currency to spend amount isn't a number!"); return;}
                let spend_per_trade = Number.parseFloat(split_command[1])/5;
                if (last_ready_trade !== null) {
                    let qty_total = 0;
                    for (let idx in last_ready_trade.buy_points) {
                        if (last_ready_trade.buy_points.hasOwnProperty(idx)) {
                            let quantity = Math.floor((spend_per_trade / last_ready_trade.buy_points[idx]));
                            console.log(last_ready_trade.buy_points[idx]);
                            await binanceClient.order({
                                symbol: last_ready_trade.symbol,
                                side: 'BUY',
                                type: 'LIMIT',
                                timeInForce: 'GTC',
                                quantity: quantity,
                                price: last_ready_trade.buy_points[idx].toFixed(8),
                            })
                                .then(() => {qty_total += quantity; msg.channel.send("Order Placed:\n```\nQuantity: " + quantity + "\nPrice: " + last_ready_trade.buy_points[idx].toFixed(8).replace(/0+$/, '').replace(/\.$/, '') + "\n Symbol: " + last_ready_trade.symbol+ "\n```")})
                                .catch(reason => {msg.channel.send("Order Failed: `" + reason.toString() + "`")});
                        }
                    }
                    db.get("sellInfo").push({symbol: last_ready_trade.symbol, split_symbol: last_ready_trade.split_symbol, stop_loss: last_ready_trade.stop_loss, take_profit: last_ready_trade.take_profit, quantity: qty_total}).write();
                    msg.channel.send("Orders Done! Here's the selling info when the time comes: \n```\n" +
                        "!birbsell " + JSON.stringify({symbol: last_ready_trade.symbol, split_symbol: last_ready_trade.split_symbol, stop_loss: last_ready_trade.stop_loss, take_profit: last_ready_trade.take_profit, quantity: qty_total}) + "\n" +
                        "```"
                    );
                } else {
                    msg.channel.send("No Ready Trade Available!");
                }
            } else {
                msg.channel.send("You must specify an amount of the purchasing currency to use as a second parameter (usually BTC)");
            }
        } else if (msg.content.startsWith("!birbsell")) {
            let split_command = msg.content.split(" ");
            if (split_command.length === 2) {
                let parsed_json = {};
                try {
                    parsed_json = JSON.parse(split_command[1]);
                } catch (exception) {
                    msg.channel.send("Error reading data: `" + exception.toString() + "`");
                    return;
                }

                let account_info_ = await binanceClient.accountInfo();
                let balance_ = 0;
                for (i = 0; i < account_info_.balances.length; i++) {
                    let this_bal = account_info_.balances[i];
                    if (this_bal.asset.substring(0, 3) === parsed_json.symbol.substring(0, 3) || this_bal.asset.substring(0, 4) === parsed_json.symbol.substring(0, 4)) {
                        balance_ = (+this_bal.free);
                    }
                }
                if (balance_ === 0) {
                    msg.channel.send("All of this token is already for sale!");
                    return;
                }

                let open_orders = await binanceClient.openOrders({
                        symbol: parsed_json.symbol,
                    }).catch(() => {console.log("Error Getting Open Orders!")});
                if (open_orders !== undefined && open_orders !== null) {
                    for (let ixd in open_orders) {
                        if (open_orders.hasOwnProperty(ixd) && open_orders[ixd].type === "STOP_LOSS_LIMIT") {
                            await binanceClient.cancelOrder({
                                symbol: parsed_json.symbol,
                                orderId: open_orders[ixd].orderId,
                            }).then(() => msg.channel.send("Cancelled previous OCO Order!"))
                                .catch(reason => msg.channel.send("Error Cancelling OCO Order: `" + reason.toString() + "`"));
                        }
                    }
                }

                let account_info = await binanceClient.accountInfo();
                let balance = 0;
                for (i = 0; i < account_info.balances.length; i++) {
                    let this_bal = account_info.balances[i];
                    if (this_bal.asset.substring(0, 3) === parsed_json.symbol.substring(0, 3) || this_bal.asset.substring(0, 4) === parsed_json.symbol.substring(0, 4)) {
                        balance = (+this_bal.free);
                    }
                }
                if (parsed_json.quantity > balance) {
                    parsed_json.quantity = Math.floor(balance); // if full order not filled, get what was!
                }
                let qty_per_trade = Math.floor(Number(parsed_json.quantity) / Number(parsed_json.take_profit.length));
                let add_to_trade = Number(parsed_json.quantity) % Number(qty_per_trade);
                for (let idx in parsed_json.take_profit) {
                    if (parsed_json.take_profit.hasOwnProperty(idx) && qty_per_trade + add_to_trade > 0) {
                        await binanceClient.orderOco({
                            symbol: parsed_json.symbol,
                            side: 'SELL',
                            quantity: (qty_per_trade + add_to_trade),
                            price: parsed_json.take_profit[idx].toFixed(8),
                            stopPrice: parsed_json.stop_loss.toFixed(8),
                            stopLimitPrice: parsed_json.stop_loss.toFixed(8),
                            stopLimitTimeInForce: 'GTC'
                        })
                            .then(() => {
                                add_to_trade = 0;
                                msg.channel.send("Order Placed:\n```\nQuantity: " + (qty_per_trade + add_to_trade) + "\nTP Price: " + parsed_json.take_profit[idx] + "\nSL Price: " + parsed_json.stop_loss + "\n Symbol: " + parsed_json.symbol + "\n```")
                            })
                            .catch(reason => {
                                msg.channel.send("Order Failed: `" + reason.toString() + "`")
                            });
                    } else {
                        if (qty_per_trade + add_to_trade <= 0 || isNaN(qty_per_trade + add_to_trade)) {
                            msg.channel.send("Not enough coins to sell!");
                            return;
                        }
                    }
                }
            }
        } else if (msg.content.startsWith("!sellall")) {
            let split_command = msg.content.split(" ");
            if (split_command.length === 3) {
                let account_info = await binanceClient.accountInfo();
                let balance = 0;
                for (i = 0; i < account_info.balances
                    .length; i++) {
                    let this_bal = account_info.balances[i];
                    if (this_bal.asset === split_command[1].toUpperCase()) {
                        balance = (+this_bal.free);
                    }
                }
                balance = Math.floor(balance);
                if (balance > 0) {
                    let order_success = true;
                    await binanceClient.order({
                        symbol: split_command[1].toUpperCase() + split_command[2].toUpperCase(),
                        side: "SELL",
                        type: "MARKET",
                        quantity: balance,
                    }).catch(reason => {order_success = false; msg.channel.send("Sell All Failed: `" + reason.toString() + "`")});
                    if (!order_success) return;
                    msg.channel.send("Sold All `" + split_command[1].toUpperCase() + "`");
                } else {
                    msg.channel.send("Not enough coins to sell!");
                }
            } else {
                msg.channel.send("Format: `!sellall [from] [to]`")
            }
        } else if (msg.content.startsWith("!deposit")) {
            let split_command = msg.content.split(" ");
            if (split_command.length === 2) {
                let to_return = false;
                let deposit_info = await binanceClient.depositAddress({ asset: split_command[1].toUpperCase() })
                    .catch(reason => {to_return = true; msg.channel.send("Couldn't get deposit address. Reason: `" + reason.toString() + "`")});

                if (to_return) return;

                let memo_string = "";
                if (deposit_info.addressTag !== "") {
                    memo_string = " with memo `" + deposit_info.addressTag + "`";
                }
                msg.channel.send("To Deposit `" + deposit_info.asset + "` into your Binance Account, please send `" + deposit_info.asset + "` to `" + deposit_info.address + "`" + memo_string + "!")
            } else {
                msg.channel.send("Asset not specified!");
            }
        }
    } else {
        if (msg.content.startsWith("!")) {
            msg.reply("You can't use this bot!");
        }
    }
});

discordClient.login(process.env.DISCORD_TOKEN);