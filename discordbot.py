import asyncio
import discord
from discord.ext import commands
from discord import app_commands
from discord.app_commands import describe
from aiohttp import web
import os
import random

TOKEN = os.environ.get("BOT_TOKEN")
BOT_SECRET = os.environ.get("BOT_SECRET")  # Supabase Secrets の DISCORD_BOT_SECRET と同じ値
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix=commands.when_mentioned_or("!"), intents=intents)
tree = bot.tree

admin_id = [447551013763678208]
q_id = [736041262288863314, 1146920779695542282, 325699632036446212, 743312946955812946, 748104554456940545, 935384717971312660, 830582346767400971, 165918545975181312, 451040362094526490, 847816792932220938, 506825535272386581, 316906181174099970, 595811416351703101, 871743426620706847, 720937043328368680, 834389536510443540, 937539245415997471, 256690534582714368, 341211236496572428, 893874919878836294, 969227021345492992, 344004546504425473, 596886848605913098, 955087114859589702, 740956031625986199, 467064272212590602, 690852174267416646, 784973409654276126, 982236550161125398, 461725672658698267, 557485522344214529, 708298047184044122, 703431721483370518, 400864007507935240, 848596266094559313, 237711240632336384, 733977065627320361]
LOG_GUILD_ID = 1400145776381919272
LOG_CHANNEL_ID = 1423007458959429673

# ============================================================
# HTTP サーバー（bobtter 認証用 DM 送信エンドポイント）
# POST /send-dm
# Header: X-Bot-Secret: <BOT_SECRET>
# Body:   {"discord_id": "123456789", "message": "認証コード: 123456"}
# ============================================================

async def handle_send_dm(request: web.Request) -> web.Response:
    if request.headers.get("X-Bot-Secret") != BOT_SECRET:
        return web.Response(status=401, text="Unauthorized")
    try:
        data = await request.json()
        user_id = int(data["discord_id"])
        message = data["message"]
    except Exception:
        return web.Response(status=400, text="Bad Request")
    try:
        user = await bot.fetch_user(user_id)
        await user.send(message)
        return web.Response(status=200, text="OK")
    except discord.NotFound:
        return web.Response(status=404, text="User not found")
    except discord.Forbidden:
        return web.Response(status=403, text="Cannot send DM to this user")
    except Exception as e:
        return web.Response(status=500, text=str(e))

async def start_web_server():
    port = int(os.environ.get("PORT", 8080))
    app = web.Application()
    app.router.add_post("/send-dm", handle_send_dm)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", port).start()

@bot.event
async def setup_hook():
    await start_web_server()

@tree.command(name="gacha", description="10連ガチャを回します。")
async def gacha(interaction: discord.Interaction):
    if interaction.channel_id not in (1400194814624141392, 1048878265168842792):
        await interaction.response.send_message("このチャンネルでは使用できません。", ephemeral=True)
        return

    Q = ["ベリーベリーベリーロングボブ", "ビッグジム"]
    XXR = ["ボブ", "ジム", "えな"]
    SSR = ["ぶち殺すゾウ", "デスおぶし", "おふとん", "藤田ことね［雨上がりのアイリス］", "ぽっぽちゃん", "くるぶし", "ダイナマイトボディエナガ"]
    SR = ["痣　少焼", "歩きエナガ", "ヒトデマン", "メスガキ", "ムキムキエナガ", "プリン", "ずんちゃ", "お寿司（サーモン）", "高速黙りモード移行男", "ドダイにしてみせるお姉さん", "横幅エナガ"]
    R = ["オフロスキー", "栗きんとん", "カニンジャ", "ラーメン", "ぐんぐんグルト", "強奪王ブンドルド", "立つドン", "デカハリル", "作品4", "ツャツャエナガ", "沖ノ鳥島"]
    N = ["キウイマン", "舞う！！！！馬", "マイバチ（1本）", "たこ焼き", "ミ＝ゴス", "ポッピンクッキン ホイップケーキやさん", "縦連", "オタマトーン", "3ヶ月目のカレー", "パピコ", "お寿司（たまご）", "肩幅うさぎ", "ネギ", "15円玉", "雪降り、メソクソ", "イーロン・マスク", "アメリカセンダングサ","醤油", "Dutedimpianekepusaan-分散的絶望夢-", "判定線抱き枕"]

    result = ["## ガチャ結果"]
    for _ in range(10):
        f = random.randint(0, 999)
        if f == 0:
            result.append(f"**[XXR] {random.choice(Q)}**")
        elif f <= 9:
            result.append(f"**[XXR] {random.choice(XXR)}**")
        elif f <= 49:
            result.append(f"[SSR] {random.choice(SSR)}")
        elif f <= 149:
            result.append(f"[SR] {random.choice(SR)}")
        elif f <= 399:
            result.append(f"[R] {random.choice(R)}")
        else:
            result.append(f"[N] {random.choice(N)}")

    """

    result = ["## ガチャ結果"]
    for _ in range(10):
        f = random.randint(0, 1000)
        if f == 0:
            result.append(f"**[E] ポッピンクッキン どでかいボブやさん**")
        elif f <= 100:
            result.append(f"[E] ポッピンクッキン くるくるたこやき")
        elif f <= 200:
            result.append(f"[E] ポッピンクッキン できたてパンやさん")
        elif f <= 300:
            result.append(f"[E] ポッピンクッキン ケーキのおうち")
        elif f <= 400:
            result.append(f"[E] ポッピンクッキン ハンバーガーやさん")
        elif f <= 500:
            result.append(f"[E] ポッピンクッキン つくろう！おべんとう")
        elif f <= 600:
            result.append(f"[E] ポッピンクッキン なりきりパティシエ")
        elif f <= 700:
            result.append(f"[E] ポッピンクッキン たいやき&たこやき")
        elif f <= 800:
            result.append(f"[E] ポッピンクッキン 憧れのショコラティエ")
        elif f <= 900:
            result.append(f"[E] ポッピンクッキン たのしいおすしやさん")
        else:
            result.append(f"[E] ポッピンクッキン ホイップケーキやさん")

    """

    await interaction.response.send_message("\n".join(result))

@tree.command(name="omikuji", description="おみくじを引きます。")
async def omikuji(interaction: discord.Interaction):
    if interaction.channel_id not in (1400194814624141392, 1048878265168842792):
        await interaction.response.send_message("このチャンネルでは使用できません。", ephemeral=True)
        return
    
    R = ["大吉", "ボブい", "良さげ", "Good", "良兆", "アツい", "手応えあり", "追い風", "吉兆", "恵みあり", "敵なし", "福の気配", "幸あり", "ウオオオオオオ", "デカ吉", "優", "絶好調", "うまく行く", "すごい", "快調", "ハッピー", "<:muscle_puku:1400271171093659658>", "最強"]
    CA = ["健康","学問","恋愛","金運","地力"]
    I = ["キウイマン", "舞う！！！！馬", "マイバチ（1本）", "たこ焼き", "ミ＝ゴス", "縦連", "オタマトーン", "3ヶ月目のカレー", "パピコ", "お寿司（たまご）", "肩幅うさぎ", "ネギ", "15円玉", "醤油", "Dutedimpianekepusaan-分散的絶望夢-", "判定線抱き枕", "オフロスキー", "栗きんとん", "カニンジャ", "ラーメン", "ぐんぐんグルト", "強奪王ブンドルド", "立つドン", "デカハリル", "作品4", "ツャツャエナガ", "沖ノ鳥島", "ぶち殺すゾウ", "デスおぶし", "おふとん", "藤田ことね［雨上がりのアイリス］", "ぽっぽちゃん", "くるぶし", "ダイナマイトボディエナガ", "歩きエナガ", "ヒトデマン", "メスガキ", "ムキムキエナガ", "プリン", "お寿司（サーモン）", "高速黙りモード移行男", "ドダイにしてみせるお姉さん", "横幅エナガ"]

    result = ["## おみくじ"]

    for category in CA:
        result.append(f"{category}: {random.choice(R)}")

    result.append("")

    value = random.randint(0x000000, 0xFFFFFF)
    result.append(f"ラッキーカラー: #{value:06x}")
    
    result.append(f"ラッキーアイテム: {random.choice(I)}")

    result.append("")

    n=10000
    s=1.225
    weights = [1.0 / (k ** s) for k in range(1, n + 1)]
    bob = random.choices(range(1, n + 1), weights=weights, k=1)[0]
    result.append(f"ボブのデカさ: {bob}cm")
    if bob < 10:
        result.append("**評価: マイクロボブ**")
    elif bob < 20:
        result.append("**評価: ミニボブ**")
    elif bob < 30:
        result.append("**評価: ボブ**")
    elif bob < 50:
        result.append("**評価: デカボブ**")
    elif bob < 100:
        result.append("**評価: ロングボブ**")
    elif bob < 1000:
        result.append("**評価: ベリーロングボブ**")
    elif bob < 5000:
        result.append("**評価: ベリーベリーロングボブ**")
    elif bob < 9500:
        result.append("**評価: ベリーベリーベリーロングボブ**")
    else:
        result.append("**評価: ベリーベリーベリーバカデカギガロングボブ**")
    
    await interaction.response.send_message("\n".join(result))

@tree.command(name="ieo", description="インエナガチャを回します。")
@describe(n="試行回数を指定してください。", write_log="ログファイルを出力するかどうか（true/false）")
async def ieo(interaction: discord.Interaction, n: int, write_log: bool = False):
    if interaction.channel_id not in (1400194814624141392, 1048878265168842792):
        await interaction.response.send_message("このチャンネルでは使用できません。", ephemeral=True)
        return

    if not (1 <= n <= 30000) and not (interaction.user.id in admin_id and n <= 10000000):
        await interaction.response.send_message("試行回数は1回から30000回までで指定してください。", ephemeral=True)
        return

    await interaction.response.defer()

    TARGET = "INFiNiTE ENERZY -Overdoze-"
    PARTS = ["INFiNiTE", "ENERZY", "-Overdoze-"]
    OUTPUT_FILE = "ieo_log.txt"
    log = [] if write_log else None
    max_similarity = -1
    closest_string = ""
    closest_index = -1
    closest_match_counts = [0, 0, 0]
    closest_group_lengths = [8, 6, 8]

    for i in range(1, n + 1):
        shuffled_parts = [
            ''.join(random.sample(PARTS[0], 8)),
            ''.join(random.sample(PARTS[1], 6)),
            "-" + ''.join(random.sample(PARTS[2][1:-1], 8)) + "-"
        ]
        result = ' '.join(shuffled_parts)
        if write_log:
            log.append(result)

        if result == TARGET:
            if write_log:
                with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                    f.write("\n".join(log))
                await interaction.followup.send(
                    f"{i}回目でINFiNiTE ENERZY -Overdoze-が出現しました！\n```一致数: 8/8 | 6/6 | 8/8\n一致率: 22/22 (100.0%, -0)```",
                    file=discord.File(OUTPUT_FILE)
                )
            else:
                await interaction.followup.send(
                    f"{i}回目でINFiNiTE ENERZY -Overdoze-が出現しました！\n```一致数: 8/8 | 6/6 | 8/8\n一致率: 22/22 (100.0%, -0)```"
                )
            return

        similarity = sum(result[j] == TARGET[j] for j in range(22))
        if similarity > max_similarity:
            max_similarity = similarity
            closest_string = result
            closest_index = i
            parts_res = result.split(' ')
            closest_match_counts[0] = sum(a == b for a, b in zip(PARTS[0], parts_res[0]))
            closest_match_counts[1] = sum(a == b for a, b in zip(PARTS[1], parts_res[1]))
            closest_match_counts[2] = sum(a == b for a, b in zip(PARTS[2][1:-1], parts_res[2][1:-1]))

    total_match = sum(closest_match_counts)
    total_length = sum(closest_group_lengths)
    total_rate = total_match / total_length * 100
    total_mismatch = total_length - total_match
    group_rates = [
        f"{closest_match_counts[i]}/{closest_group_lengths[i]}"
        for i in range(3)
    ]

    if write_log:
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            f.write("\n".join(log))
        await interaction.followup.send(
            f"{n}回の試行中にINFiNiTE ENERZY -Overdoze-は出現しませんでした。\n"
            f"最も近かったのは{closest_index}回目の {closest_string} でした。\n"
            f"```一致数: {'| '.join(group_rates)}\n一致率: {total_match}/{total_length} ({total_rate:.1f}%, -{total_mismatch})```",
            file=discord.File(OUTPUT_FILE)
        )
    else:
        await interaction.followup.send(
            f"{n}回の試行中にINFiNiTE ENERZY -Overdoze-は出現しませんでした。\n"
            f"最も近かったのは{closest_index}回目の {closest_string} でした。\n"
            f"```一致数: {'| '.join(group_rates)}\n一致率: {total_match}/{total_length} ({total_rate:.1f}%, -{total_mismatch})```"
        )

@tree.command(name="puki", description="プキプキガチャを回します。")
async def puki(interaction: discord.Interaction):
    if interaction.channel_id not in (1400194814624141392, 1048878265168842792):
        await interaction.response.send_message("このチャンネルでは使用できません。", ephemeral=True)
        return

    await interaction.response.defer()
    
    l = 10000
    choices = ["プ", "キ"]
    s = []

    s.append(random.choice(["プ", "キ"]))

    p = 0.88

    for _ in range(1, l):
        prev = s[-1]
        if random.random() < p:
            next_char = "キ" if prev == "プ" else "プ"
        else:
            next_char = prev
        s.append(next_char)

    s = "".join(s)

    max_len = 0
    max_start = 0
    max_end = 0

    current_start = None
    expected_char = "プ"
    current_len = 0

    for i, ch in enumerate(s):
        if current_len == 0:
            if ch == "プ":
                current_start = i
                current_len = 1
                expected_char = "キ"
        else:
            if ch == expected_char:
                current_len += 1
                expected_char = "プ" if expected_char == "キ" else "キ"
            else:
                if current_len >= 2 and s[i-1] == "キ":
                    if current_len > max_len:
                        max_len = current_len
                        max_start = current_start
                        max_end = i - 1
                if ch == "プ":
                    current_start = i
                    current_len = 1
                    expected_char = "キ"
                else:
                    current_len = 0
                    expected_char = "プ"

    if current_len >= 2 and s[-1] == "キ":
        if current_len > max_len:
            max_len = current_len
            max_start = current_start
            max_end = l - 1

    with open("result.txt", "w", encoding="utf-8") as f:
        f.write(s)

    max = s[max_start:max_end+1]

    if max_len < 100:
        await interaction.followup.send(f"{max_len}文字のプキプキが完成しました！({max_start}~{max_end}文字目)\n{'<:muscle_puku:1400271171093659658>'*(max_len//2)}",file=discord.File("result.txt"))
    else:
        await interaction.followup.send(f"{max_len}文字のプキプキが完成しました！({max_start}~{max_end}文字目)\n# <:muscle_puku:1400271171093659658> × {max_len//2}",file=discord.File("result.txt"))

@bot.command()
async def s(ctx: commands.Context):
    if ctx.author.id not in admin_id:
        await ctx.send("このコマンドの使用は制限されています。", ephemeral=True)
        return
    await ctx.send("強制終了します", ephemeral=True)
    await bot.close()

@bot.listen()
async def on_message(message):
    if message.content != "filetest":
        return
    print("c1")
    if message.attachments:
        print("c2")
        if len(message.attachments) == 4 and message.attachments[0].filename == "image.png":
            print("c3")
            await message.reply("**Coo-coo!** suspicious images detected.\nPlease try sending the images in separate messages.\n-# This feature is under testing.")
            await message.delete()
            guild = bot.get_guild(LOG_GUILD_ID)
            channel = guild.get_channel(LOG_CHANNEL_ID)
            await channel.send("Deleted suspicious images.\n" + message.attachments[0].url)
        else:
            print("c4")
            await message.reply(str(len(message.attachments)) +"/"+ message.attachments[0].filename)

@bot.event
async def on_ready():
    await tree.sync()

bot.run(TOKEN)