/**
 * 8G Firewall v1.5 — JavaScript port of https://perishablepress.com/8g-firewall/
 *
 * Categorised into two halves:
 *
 *  INTERNAL — patterns for things the app controls:
 *    query strings, HTTP methods, cookie content.
 *    Applied in middleware on EVERY route (including /api/).
 *
 *  EXTERNAL — patterns for things outside the app:
 *    user agents, request URI paths, HTTP referrer.
 *    Applied in middleware on PAGE routes; UA blocking skips /api/ to
 *    avoid breaking legitimate developer tooling.
 *
 * All patterns use String.raw to avoid double-escaping noise.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * [INTERNAL] HTTP methods that browsers never send legitimately.
 * Apache equiv: RewriteCond %{REQUEST_METHOD} ^(connect|debug|move|trace|track) [NC]
 */
export const BAD_METHOD = /^(connect|debug|move|trace|track)$/i;

/**
 * [INTERNAL] Malicious cookie payloads: HTML injection, null bytes, CRLF.
 * Apache equiv: RewriteCond %{HTTP_COOKIE} (<|>|\'|%0A|%0D|%27|%00) [NC]
 */
export const BAD_COOKIE = /[<>']|%0[aAdD]|%27|%00/;

/**
 * [INTERNAL] Malicious query string patterns.
 * Covers SQL injection, XSS, LFI, RFI, command injection, PHP code execution.
 * Apache equiv: 8G [QUERY STRING] block — 50+ conditions.
 *
 * Test against the RAW (undecoded) query string, e.g.:
 *   const raw = req.url.split('?')[1] ?? '';
 */
export const BAD_QUERY = new RegExp([
  // Null byte / CRLF injection
  String.raw`(%00|0x00|%0d%0a)`,
  // Excessively long value — fuzzer / buffer overflow probe
  String.raw`[a-z0-9]{4000,}`,
  // Protocol injection: php:// ftp:// inurl://
  String.raw`(s)?(ftp|inurl|php)(s)?:(%2f|%u2215|\/){2}`,
  // Path traversal: ../../ or URL-encoded variants
  String.raw`(%2e|\.){2,}(%2f|%u2215|\/)`,
  // Triple slash
  String.raw`(%2f|\/){3,}`,
  // LFI — system files
  String.raw`etc(%2f|\/)(hosts|motd|shadow|passwd)`,
  String.raw`((boot|win)(%2e|\.)ini)`,
  String.raw`self(%2f|\/)environ`,
  // SSRF — loopback
  String.raw`(localhost|127(%2e|\.)0(%2e|\.)0(%2e|\.)1)`,
  // Header injection
  String.raw`header:`,
  String.raw`set-cookie:.{0,100}=`,
  // SQL injection
  String.raw`union.{0,25}select.{0,25}(%28|\()`,
  String.raw`(%2b|\+)(concat|delete|get|select|union)(%2b|\+)`,
  String.raw`order(\s|%20)by(\s|%20)1--`,
  String.raw`[;'")<>%00].{0,30}(alter|base64|benchmark|cast|concat|convert|create|declare|delay|delete|drop|hex|insert|load_file|md5|replace|select|sleep|truncate|unhex|update)`,
  String.raw`(\\x00|or%201(=|%3d)1|cast(%28|\()0x)`,
  // XSS — tag injection
  String.raw`(%3c|<).{0,60}(embed|iframe|object|script).{0,60}(%3e|>)`,
  // JavaScript URI scheme (encoded variants)
  String.raw`(j|%6a)(a|%61)(v|%76)(a|%61)(s|%73)(c|%63)(r|%72)(i|%69)(p|%70)(t|%74)(%3a|:)`,
  // PHP code execution functions (must be followed by '(' to avoid false positives)
  String.raw`(eval|base64_(en|de)code|assert|passthru|shell_exec|proc_open|popen|system|phpinfo|file_put_contents|fsockopen|p?fsockopen|curl_exec|fwrite|fopen|fgets|exec|phpshell|webshell)(%28|\()`,
  // RFI: absolute_dir=ftp:// style
  String.raw`(absolute_|base|root_)(dir|path)(=|%3d)(ftp|https?)`,
  // Config file access via query param
  String.raw`(%2f|\/)(wp-)?config((%2e|\.)inc)?((%2e|\.)php)`,
  // TimThumb exploit
  String.raw`(thumbs?(_editor|open)?|tim(thumbs?)?)(%2e|\.)php`,
  // Global / request variable injection
  String.raw`(globals|mosconfig[a-z_]{0,22}|_request)(=|\[)`,
  // Dangerous PHP params regardless of context
  String.raw`(@copy|\$_(files|get|post)|allow_url_(fopen|include)|auto_prepend_file|(php|web)shell|disable_functions|open_basedir|safe_mode|shell_exec|sp_executesql|trojan|wget|wp_insert_user)`,
  // Backtick / caret / pipe in query (shell injection)
  String.raw`[` + '`' + String.raw`\^|]`,
].join('|'), 'i');

// ═══════════════════════════════════════════════════════════════════════════════
// EXTERNAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * [EXTERNAL] Googlebot family — ALWAYS allowed through.
 * Must be checked BEFORE BAD_UA.
 */
export const ALLOW_UA = /Googlebot|AdsBot-Google|APIs-Google|Mediapartners-Google|Google-InspectionTool/i;

/**
 * [EXTERNAL] Blocked user agents.
 * Combines AI training bots (mirrors robots.ts) + 8G scraper/exploit UA list.
 * Apache equiv: 8G [USER AGENT] block.
 */
export const BAD_UA = new RegExp([
  // Injection in the UA header itself
  String.raw`%0[aAdD]|%27|%3[ce]|%00|0x00`,
  // Extremely long UA string — fuzzer
  String.raw`[a-z0-9]{2000,}`,
  // AI training / LLM crawlers
  String.raw`GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|anthropic-ai|Claude-Web`,
  String.raw`PerplexityBot|Perplexity-User|Google-Extended|CCBot`,
  String.raw`Bytespider|FacebookBot|meta-externalagent|meta-externalfetcher`,
  String.raw`Applebot|Amazonbot|cohere-ai|AI2Bot|Diffbot|ImagesiftBot`,
  String.raw`YouBot|PetalBot|Omgili|Omgilibot|magpie-crawler|Timpibot`,
  String.raw`VelenPublicWebCrawler|TurnitinBot|SemrushBot|DotBot|MJ12bot`,
  String.raw`AhrefsBot|BLEXBot|DataForSeoBot|SeekportBot|FriendlyCrawler`,
  String.raw`Scrapy|TavilyBot|img2dataset`,
  // Exploit payloads embedded in UA
  String.raw`(c99|php|web)shell|sitecopier|base64_decode|bin\/bash|disconnect|unserializ`,
  // eval in UA (code injection attempt)
  String.raw`\beval\b`,
  // 8G scraper / vulnerability scanner list (from perishablepress.com/8g-firewall/)
  String.raw`acapbot|acoonbot|alexibot|antbot|asterias|attackbot|awario|babbar|backdor|barkrowler|becomebot|binlar|bitsightbot|blackwidow|blekkobot|blex|blowfish|bullseye|bunnys|butterfly`,
  String.raw`careerbot|casper|censysinspect|checkpriv|cheesebot|cherrypick|chinaclaw|choppy|clshttp|cmsworld|commoncrawl|copernic|copyrightcheck|cosmos|crawlergo|crescent|criteo|datacha|dataforseo`,
  String.raw`diavol|discobot|dittospyder|dotbot|dotnetdotcom|dumbot|econtext|emailcollector|emailsiphon|emailwolf|eolasbot|eventures|extract|eyenetie|feedfinder|flaming|flashget|flicky|foobot`,
  String.raw`g00g1e|getright|gigabot|go-ahead-got|go-http-client|gozilla|grabnet|grafula|harvest|heritrix|hrankbot|httracks?|icarus6j|intelx|jetbot|jetcar|jikespider|kmccrew|leechftp|libweb|liebaofast`,
  String.raw`ahrefs|archiver|libwww-perl|pycurl|linkscan|linkwalker|lwp-download|majestic|masscan|mauibot|miner|mechanize|morfeus|moveoverbot|mozlila|netmechanic|netspider|nicerspro|nikto|ninja|nominet|nutch`,
  String.raw`octopus|pagegrabber|petalbot|planetwork|postrank|proximic|purebot|queryn|queryseeker|radian6|radiation|realdownload|remoteview|rogerbot|scooter|seekerspid`,
  String.raw`semalt|seokicks|seznambot|siclab|sindice|sistrix|sitebot|siteexplorer|sitesnagger|skygrid|smartdownload|snoopy|sosospider|spankbot|spbot|sqlmap|stackrambler|stripper|sucker|surftbot`,
  String.raw`sux0r|suzukacz|suzuran|takeout|teleport|telesoft|true_robots|turingos|turnit|tweetmemebot|vampire|vikspider|voideye|webleacher|webreaper|webstripper|webvac|webviewer|webwhacker|wellknownbot`,
  String.raw`winhttp|wwwoffle|woxbot|xaldon|xxxyy|yamanalab|yioopbot|yisouspider|youda|zeus|zmeu|zoominfobot|zune|zyborg`,
].join('|'), 'i');

/**
 * [EXTERNAL] Request URI attack patterns.
 * Covers shell uploads, PHP config file probes, path traversal, webshell names,
 * dangerous dotfiles, and vulnerability scanner signatures.
 * Apache equiv: 8G [REQUEST URI] block — 60+ conditions.
 *
 * Test against req.nextUrl.pathname.
 */
export const BAD_URI = new RegExp([
  // Null byte / CRLF in path
  String.raw`%00|0x00|%0d%0a`,
  // Triple-slash / double-? / /&&
  String.raw`\/{3,}|\?\?|\/&&`,
  // Absurdly long path segment — fuzzer
  String.raw`[a-z0-9]{2000,}`,
  // Shell metacharacters embedded in path
  '[\\^`<>|]',
  // Sensitive dotfiles that must never be served
  String.raw`\.(htaccess|htpasswd|env|git|svn|hg|idea|ds_store|bash_?history?|npmrc|aws|make)(\/|$)`,
  // File extensions Next.js would never serve (PHP, ASP, scripts, archives, DBs)
  String.raw`\.(php\d?|phtml|asp|aspx|cfm|cfml|cgi|pl|sh|bash|exe|dll|msi|bat|vbs|jar|sql|db|mdb|pdb|tar|tgz|gz|zip|rar|7z|bz2)$`,
  // Backup archives in any path
  String.raw`(archive|backup|db|master|sql|wp|www|wwwroot)\.(gz|zip|rar|tar|tgz)`,
  // /etc/ and /var/ LFI
  String.raw`\/(etc|var)\/(hidden|secret|shadow|ninja|passwd|tmp)(\/|$)`,
  // SSRF — loopback in URI
  String.raw`localhost|127\.0\.0\.1`,
  // Common webshell file names
  String.raw`\/(mad|alpha|c99|php|web)?sh(3|e)ll[\w]*\.php`,
  // Admin file-upload exploits
  String.raw`\/(admin-?|file-?)(upload)(bg|_?file|ify|svu|ye)?\.php`,
  // /bin/ command execution paths
  String.raw`\/bin\/(cc|chmod|chsh|cpp|echo|id|kill|mail|nasm|perl|ping|ps|python|tclsh)(\/|$)`,
  // JavaScript URI scheme in path
  String.raw`j(\s)*a(\s)*v(\s)*a(\s)*s(\s)*c(\s)*r(\s)*i(\s)*p(\s)*t(\s)*(%3a|:)`,
  // Protocol confusion in path
  String.raw`(s)?(ftp|http|inurl|php)(s)?:(%2f|%u2215|\/){2}`,
  // PHP code execution function names in path (require open paren)
  String.raw`(base64_(en|de)code|benchmark|curl_exec|eval|fwrite|(f|p)open|passthru|p?fsockopen|phpinfo|shell_exec|system)(\(|%28)`,
  // Well-known webshell / intrusion tool names
  String.raw`\/(c99|php|web)?shell|\/crossdomain|\/fileditor|\/locus7|\/nstview|\/r57|\/remview|\/sshphp|\/storm7|\/webadmin`,
  // WordPress exploit URI probes (scanner bots looking for WP on non-WP sites)
  String.raw`\/(wp-)((201\d|202\d|\d{2})|admin(fx|rss|setup)|booking|confirm|crons|data|file|mail|plugins?|readindex|reset|setup|story)\.php`,
  // Generic config file URI patterns
  String.raw`\/(my(sql)?-?|web-?|wp-?)?(admin-?)?(setup-?)?(conf(ig)?(uration)?)(\.(bak|inc|old|php|txt))`,
  // Known attack tool / scanner signatures in path
  String.raw`(0day|0xor|backdoor|bkv74|deadcode|exploits|gel4y|goog1es|hmei7|hnap1|indoxploi|muiebl|nessus|priv8|r00t|sh3ll|sqlpatch|sux0r|telerik|utchiha|w0rm|xattack|xbaner|xertive|xiaolei|xsamxad|zabbix|zmeu)`,
  // Dev / staging / backup path names scanners always probe
  String.raw`^/(backup|bak|beta|bkp|demo|dev(new|old)?|new-?site|null|old[-_]?(files|site)?|staging|wordpress(-old)?)(/|$)`,
  // Misc injection patterns in path
  String.raw`(\(null\)|cast\(0x|open_basedir|self\/environ|\+union\+all\+select)`,
].join('|'), 'i');

/**
 * [EXTERNAL] Pharma spam / referrer code injection.
 * Apache equiv: 8G [HTTP REFERRER] block.
 *
 * Test against req.headers.get('referer').
 */
export const BAD_REFERER = /order(\s|%20)by(\s|%20)1--|@unlink|assert\(|print_r\(|%00|xbshell|100dollars|best-seo|blue.pill|cocaine|ejaculat|erectile|erections|hoodia|impotence|levitra|libido|lipitor|phentermin|pornhelm|pro[sz]ac|sandyauer|semalt\.com|tramadol|troyhamby|ultram|unicauca|valium|viagra|vicodin|xanax/i;
