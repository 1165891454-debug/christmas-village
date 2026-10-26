/* memories.js — 我们的旅行回忆（彩蛋系统数据）
 * ★ 以后加照片只需两步：
 *   1. 把照片文件放进项目（如 photos/wuhai.jpg），并上传到 GitHub
 *   2. 把对应条目的 image: null 改成 image: 'photos/wuhai.jpg'
 *   其余什么都不用改。没有照片时游戏里显示优雅的占位框。
 * 每条：id / title / location / object(小物件形状) / color(物件色) / message(只有我们懂的话) / image(照片路径或null) / x,y(地图位置)
 */
window.Memories = [
  { id: 'wuhai',    x: 300,  y: 905,  title: '乌海 · 沙漠看海',     location: '内蒙古 · 乌海',      object: 'shell',  color: '#f2d8c8', image: null,
    message: '一枚小小的贝壳。「沙漠看海」那天风很大，你笑得比湖水还亮。' },
  { id: 'doha',     x: 1295, y: 1075, title: '多哈 · 半夜的珍珠',   location: '卡塔尔 · 多哈',      object: 'pearl',  color: '#f6f0ea', image: null,
    message: '一颗温润的小珍珠。多哈的夜晚我们说好：以后每年都要一起看世界。' },
  { id: 'sayram',   x: 335,  y: 425,  title: '赛里木湖 · 蓝色眼泪', location: '新疆 · 博尔塔拉',    object: 'drop',   color: '#6fa8e8', image: null,
    message: '一滴蓝色的湖水。都说赛里木湖是大地的眼泪——那天我们光顾着笑了。' },
  { id: 'tibet',    x: 110,  y: 650,  title: '西藏 · 高处的风',     location: '西藏',               object: 'flag',   color: '#e0563f', image: null,
    message: '一角风马旗。在离天最近的地方，风把愿望念给山听，我也悄悄许了一个。' },
  { id: 'zhuhai',   x: 470,  y: 255,  title: '珠海 · 长隆的鲸鱼',   location: '广东 · 珠海',        object: 'whale',  color: '#4f86d6', image: null,
    message: '一只小蓝鲸。海洋王国那天你排了一个小时的队，就为了那个鲸鱼发箍。' },
  { id: 'shanghai', x: 880,  y: 190,  title: '上海 · 城堡的烟花',   location: '上海 · 迪士尼',      object: 'castle', color: '#c86bb1', image: null,
    message: '一座小小的城堡。烟花放完的时候你没有看天，你在看我。' },
  { id: 'shenyang', x: 860,  y: 1000, title: '沈阳 · 澡堂之夜',     location: '辽宁 · 沈阳/长春',   object: 'steam',  color: '#e8e2d6', image: null,
    message: '一团白白的蒸汽。东北澡堂，搓完澡喝汽水——人生大事，不过如此。' },
  { id: 'kl',       x: 1040, y: 290,  title: '吉隆坡 · 双子星',     location: '马来西亚 · 吉隆坡',  object: 'tower',  color: '#8ad2ff', image: null,
    message: '一对闪亮的高塔。双子塔下面我们走散了三分钟，我急得满头汗，你却在一旁偷笑。' },
  { id: 'dongying', x: 640,  y: 1030, title: '东营 · 黄河入海',     location: '山东 · 东营',        object: 'sun',    color: '#f0a83c', image: null,
    message: '一轮小小的落日。黄河在这里入海，黄和蓝在脚下分开又拥抱。' },
  { id: 'zibo',     x: 500,  y: 405,  title: '淄博 · 小饼卷一切',   location: '山东 · 淄博',        object: 'skewer', color: '#c96a5a', image: null,
    message: '一串烤得冒油的签子。小饼卷小葱，你卷了最大的那串递给我。' },
  { id: 'wuhan',    x: 1230, y: 690,  title: '武汉 · 长江大桥',     location: '湖北 · 武汉',        object: 'bridge', color: '#b8763e', image: null,
    message: '一段小小的桥。走过长江大桥那天特别晒，我们一人一半耳机听完了一首歌。' },
  { id: 'chongqing',x: 920,  y: 845,  title: '重庆 · 山城火锅',     location: '重庆',               object: 'hotpot', color: '#c0392b', image: null,
    message: '一口翻滚的小火锅。微辣就让我们俩灌了三瓶唯怡，山城的坡我们爬了一晚上。' },
  { id: 'chengdu',  x: 110,  y: 405,  title: '成都 · 滚滚打滚',     location: '四川 · 成都',        object: 'panda',  color: '#3a3f4a', image: null,
    message: '一只黑白小团子。熊猫基地里它睡得四仰八叉，你说它像周末的我。' },
  { id: 'leshan',   x: 120,  y: 180,  title: '乐山 · 大佛脚下',     location: '四川 · 乐山',        object: 'buddha', color: '#c9a06a', image: null,
    message: '一尊小小的坐佛。大佛脚下我们仰头看了好久，你说他一定见过很多像我们这样的人。' },
  { id: 'suzhou',   x: 660,  y: 900,  title: '苏州 · 园林听雨',     location: '江苏 · 苏州',        object: 'garden', color: '#58b368', image: null,
    message: '一片小小的瓦檐。园林里下雨，我们在亭子里躲了半小时，谁都没说话，但很好。' },
  { id: 'yangzhou', x: 980,  y: 380,  title: '扬州 · 早茶',         location: '江苏 · 扬州',        object: 'tea',    color: '#a8c686', image: null,
    message: '一盅温温的茶。「早上皮包水」，蟹黄汤包上桌的时候我们的筷子打了个架。' }
];
