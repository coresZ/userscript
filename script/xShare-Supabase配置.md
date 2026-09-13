# xShare 云端备份配置说明

适用脚本：`xShare.user.js` / `xShare.v2.user.js`（当前版本 **6.9**）  
这是油猴里的隐藏自用功能。网页版 `xShare.html` 没有这套配置。

配置分两步：先在 Supabase 建好桶和表，再在脚本面板里填密钥并打开开关。

---

## 一、准备

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)（或 Violentmonkey）。
2. 安装 / 更新 `xShare.user.js`（或 v2 脚本）。
3. 准备一个 [Supabase](https://supabase.com/dashboard) 账号。免费项目即可。
4. **不要使用 `service_role` 密钥。** 脚本里只填 **anon / publishable** public key。

---

## 二、Supabase 控制台操作（只做一次）

### 1. 新建或打开项目

1. 打开 [https://supabase.com/dashboard](https://supabase.com/dashboard)。
2. 进入你的项目。若项目显示暂停，先点一次唤醒，等状态变绿。

### 2. 建公开存储桶

1. 左侧 **Storage** → **New bucket**。
2. 名称填：`xshare`（必须和脚本默认桶名一致，或之后在脚本里改成你的名字）。
3. 勾选 **Public bucket**。
4. 创建。

桶里之后会自动出现两类路径，不用手工建文件夹：

```
xshare/
  img/{hash}.jpg          配图（按原图链接去重）
  cards/日期/x_id_时间.png  分享卡片
  cards/日期/x_id_时间.md   Markdown
```

### 3. 给桶加策略

进入 **Storage → xshare → Policies**（或 **Storage → Policies** 里对该桶的 Objects）。

给角色 `anon` 打开这三项（名称可自定）：

| 操作 | 目标 | 角色 | 条件 |
|---|---|---|---|
| SELECT | Objects | anon | `true` |
| INSERT | Objects | anon | `true` |
| UPDATE | Objects | anon | `true` |

UPDATE 是为了「覆盖」时往同一路径再写。没有 UPDATE 时，覆盖上传可能失败。

若界面是填 Policy SQL，可用：

```sql
create policy "xshare read"
on storage.objects for select to anon
using (bucket_id = 'xshare');

create policy "xshare insert"
on storage.objects for insert to anon
with check (bucket_id = 'xshare');

create policy "xshare update"
on storage.objects for update to anon
using (bucket_id = 'xshare')
with check (bucket_id = 'xshare');
```

桶名如果不是 `xshare`，把上面的 `'xshare'` 改掉。

### 4. 建表（SQL Editor 整段执行）

左侧 **SQL Editor** → New query，粘贴后 Run：

```sql
create table if not exists public.images (
  id bigint generated always as identity primary key,
  source_url text not null unique,
  path text not null,
  url text not null,
  size bigint,
  width int,
  height int,
  created_at timestamptz default now()
);

create table if not exists public.cards (
  id bigint generated always as identity primary key,
  title text,
  kind text,
  path text not null,
  size bigint,
  width int,
  height int,
  source_url text,
  created_at timestamptz default now()
);

alter table public.images enable row level security;
alter table public.cards enable row level security;

drop policy if exists "images read" on public.images;
drop policy if exists "images write" on public.images;
drop policy if exists "cards read" on public.cards;
drop policy if exists "cards write" on public.cards;
drop policy if exists "cards update" on public.cards;

create policy "images read" on public.images for select to anon using (true);
create policy "images write" on public.images for insert to anon with check (true);
create policy "cards read" on public.cards for select to anon using (true);
create policy "cards write" on public.cards for insert to anon with check (true);
create policy "cards update" on public.cards for update to anon using (true) with check (true);

create unique index if not exists images_source_url_uidx
  on public.images (source_url);

create unique index if not exists cards_kind_source_uidx
  on public.cards (kind, source_url)
  where source_url is not null;
```

说明：

- `images`：图床目录。同一张原图链接只存一行。
- `cards`：分享卡 png 和 Markdown 各一行。同一原帖 + 同一类型只允许一条（覆盖时更新这一行）。
- 若提示 `policy "cards read" already exists`，上面的 `drop policy if exists` 已经处理，再跑一遍即可。
- 若 `cards_kind_source_uidx` 报唯一冲突，先在 **Table Editor → cards** 里删掉同一篇的重复行，再单独执行最后那句 `create unique index`。

### 5. 复制 API 地址和密钥

1. 打开 **Project Settings → API**（有的界面叫 **API Keys**）。
2. 复制两样：

| 项 | 示例 | 用途 |
|---|---|---|
| Project URL | `https://xxxx.supabase.co` | 脚本里的 Project URL |
| anon public / publishable key | 以 `eyJ` 开头的长串 | 脚本里的 anon public key |

不要复制 `service_role`。

---

## 三、油猴脚本怎么打开配置

这是隐藏入口，面板上没有「云端设置」四个字。

1. 打开任意 `x.com` 帖子或文章。
2. 点分享卡片按钮（或文章页的「生成文章卡片」），打开 xShare 面板。
3. 看左上角版本号，例如 `v6.9`。
4. **连点版本号三次**（约 1 秒内点完）。
5. 弹出「云端备份（自用）」。

填这四项：

| 字段 | 填什么 |
|---|---|
| Project URL | `https://xxxx.supabase.co`，末尾不要斜杠 |
| anon public key | Settings 里复制的 anon key |
| Bucket | 默认 `xshare`，和你建的桶名一致 |
| 启用远程备份 | **必须勾上** |

点 **保存**。

- 勾了且 URL、key 都有：提示「云端备份已开启」，左侧会出现同步按钮。
- 没勾或少填：提示「已保存（未开启或凭证不完整）」，不同步。

凭证存在本机油猴存储（`GM_setValue`）和 `localStorage`，换浏览器要再填一次。

---

## 四、四个按钮怎么用

启用后，下载按钮下面多出：

| 按钮 | 做什么 |
|---|---|
| 同步配图 | 只把正文/封面图传到 `images`。同一源链接已有则跳过。 |
| 同步卡片图片 | 把当前分享卡整图传到桶，并在 `cards` 记一条 `kind=png`。 |
| 同步 Markdown | 先按链接查/传配图，再把改写过链接的 md 传上去，`cards` 记 `kind=md`。 |
| 打开云端库 | 按标题或帖子 ID 查已同步的卡片和 md。 |

规则：

- 同一篇原帖的 png / md 若已存在，会弹出 **覆盖 / 取消**。取消则不传。
- 配图按原图 URL 全局唯一，不绑帖子，已有直接复用链接。
- 收图失败时，md 里会写成 `![未备份](原链接)`。
- 空白或过小的卡片图不会上传。
- 文件传上去了但表没写上，会提示「文件已上传，目录登记失败」。

云端库：

- 搜索框支持标题、原帖 URL、数字 ID；输入后约 0.3 秒自动搜。
- 可筛 卡片 / Markdown，以及今天 / 7 天。
- 点胶囊复制该文件的公开地址；点「原帖」打开 X。
- 时间悬停可看带年份的完整时间；胶囊悬停可看体积、尺寸、路径。

---

## 五、可选：清理旧数据里的错误原帖链接

早期版本可能把 `/photo/1` 或图片地址写进 `cards.source_url`。在 SQL Editor 执行：

```sql
update public.cards
set source_url = 'https://x.com/i/article/' || substring(source_url from 'article/([0-9]+)')
where source_url ~ 'article/[0-9]+';

update public.cards
set source_url = 'https://x.com/i/status/' || substring(source_url from 'status(?:es)?/([0-9]+)')
where source_url ~ 'status(?:es)?/[0-9]+'
  and source_url !~ 'article/[0-9]+';

update public.cards
set source_url = null
where source_url ~ 'twimg\.com' or source_url ~ '/media/';
```

然后再建（若还没有）唯一索引：

```sql
create unique index if not exists cards_kind_source_uidx
  on public.cards (kind, source_url)
  where source_url is not null;
```

---

## 六、自检清单

上传失败时按下面看：

1. 脚本版本是 6.9，并且连点版本号后「启用远程备份」是勾上的。
2. URL 是 `https://项目号.supabase.co`，不是 Dashboard 网页地址。
3. Key 是 anon，不是 service_role。
4. 桶名与脚本里填的完全一致，且为 Public。
5. Storage 有 anon 的 SELECT / INSERT / UPDATE。
6. `images`、`cards` 两张表都在，RLS 策略已建。
7. 覆盖时报错时，确认有 `cards update` 策略。
8. 免费项目若长时间不用会暂停，Dashboard 打开一次再同步。
9. 油猴的脚本设置里，`@connect *` / 允许跨域应保持开启，否则读不到 X 配图、也写不进桶。

---

## 七、安全说明（自用）

anon 目前可以读写整个 `xshare` 桶和两张表。密钥写在这台浏览器的油猴存储里。

- 不要把带密钥的脚本备份发到公开仓库。
- 不要把 service_role 填进面板。
- 链接是 Public bucket 地址，发出去谁都能打开对应文件。

这套功能只建议自己用。
