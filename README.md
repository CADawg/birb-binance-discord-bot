# birb-binance-discord-bot
Discord bot for The Birb Nest's `#official-calls` channel.

This bot converts `#official-calls` which maintain a pretty universal standard into trades on the Binance Exchange. It has to make some assumptions to work.

### Commands

`!orders <PAIR>`

Shows all orders for the given pair.

`!bal(ances)`

Shows all your Binance Balances

`````
!birb
```
call TITLE
QSP Trend Continuation

call TECHNICAL EXPLANATION
QSP/BTC had a bigger run up from the start of June, pulled back and is now gradually increasing in price.
By looking at the past candles I found that these candles are on high volume, but pump in a few minutes.
That means 1 party is trying to get as much QSP as it can, regardless of the volume in the orderbook. This party is probably ready to party, since it has long intentions,

As long at QSP holds the bottom of the channel and the 20 or 50 EMA, I see a chance of a retest of at least the top.
The last target is past the previous high but into HTF resistance. If that hits it's best to close the position since I expect a bigger retrace there.
 
call STRUCTURE
buy @ 228-240
TP @ 258 / 276 / 308 / 363
sl @ 215
```
`````

Parses the given Birb Nest Official Call. 3 Backticks are required, as this tells the bot where to start reading it's data from
It will then tell you what it understood of the call and allow you to use commands to correct it or agree with the bot.

`!realify`

Takes the above trade (specified via the !birb command) and converts it to one using real values as The Birb Nest often uses whole numbers to specify price at the same decimal places as the current price. The bot can understand this and convert it for you.

`!cancelall <PAIR>`

Cancel All Orders In the given pair.

`!xcqtbuy <Amount of countercurrency to spend>`

Executes a `!realify`'d trade with the given amount of money.

`!birbsell <Output From !xcqtbuy>`

Sells using the given call. This is now done automatically by the bot every 10 minuites.

`!sellall <from> <to>`

Sells all tokens from one to another, only works if tokens have a direct pair.

`!deposit <currency>`

Shows you deposit information for that currency

### .env File
```
DISCORD_TOKEN= // Bot's discord token
BINANCE_APIKEY= // Binance API Key
BINANCE_APISECRET= // Binance API Secret
```
