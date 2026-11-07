<?php
// Thundersales Beller Records — API (PHP 7.3+)
declare(strict_types=1);
require __DIR__ . '/config.php';

const DATA_FILE = __DIR__ . '/data/data.php';
const GUARD = '<?php http_response_code(404); exit; ?>';
// urenWeek = actuele stand deze week; salesTotaal (aantal) en urenTotaal = all-time totalen
const FIELDS = ['salesDag', 'salesWeek', 'salesMaand', 'urenWeek', 'salesTotaal', 'urenTotaal'];

$lifetime = SESSION_DAYS * 86400;
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
ini_set('session.gc_maxlifetime', (string)$lifetime);
session_name('tslb');
session_set_cookie_params([
    'lifetime' => $lifetime,
    'path'     => rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/',
    'secure'   => $https,
    'httponly' => true,
    // 'None' is nodig zodat de login ook binnen Microsoft Teams (iframe) blijft werken
    'samesite' => $https ? 'None' : 'Lax',
]);
session_start();

// Sessiecookie 'Partitioned' maken (CHIPS), zodat browsers die cookies van derden
// blokkeren de login binnen Teams toch onthouden.
function partition_cookies(): void {
    global $https;
    if (!$https || headers_sent()) return;
    $cookies = array_filter(headers_list(), fn($h) => stripos($h, 'Set-Cookie:') === 0);
    if (!$cookies) return;
    header_remove('Set-Cookie');
    foreach ($cookies as $c) {
        if (stripos($c, 'partitioned') === false) $c .= '; Partitioned';
        header($c, false);
    }
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

function out($data, int $code = 200): void {
    partition_cookies();
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
function role(): ?string { return $_SESSION['role'] ?? null; }

function seed(): array {
    $b = function ($id, $name, $sd, $sw, $sm, $uw, $bt, $ut) {
        return ['id' => $id, 'name' => $name, 'salesDag' => $sd, 'salesWeek' => $sw, 'salesMaand' => $sm, 'urenWeek' => $uw, 'salesTotaal' => $bt, 'urenTotaal' => $ut];
    };
    return ['updatedAt' => gmdate('c'), 'bellers' => [
        $b('b1', 'Nora Bakker', 4, 11, 11, 21.5, 11, 21.5),
        $b('b2', 'Yordal', 2, 4, 4, 18.42, 4, 18.42),
        $b('b3', 'Liam', 1, 3, 3, 35.25, 3, 35.25),
        $b('b4', 'Maite Huigens', 1, 2, 2, 33.5, 2, 33.5),
    ]];
}

function load(): array {
    if (!is_file(DATA_FILE)) return seed();
    $raw = (string)file_get_contents(DATA_FILE);
    $json = substr($raw, strlen(GUARD) + 1);
    $data = json_decode($json, true);
    return is_array($data) ? $data : seed();
}

function store(array $data): void {
    $dir = dirname(DATA_FILE);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if (file_put_contents(DATA_FILE, GUARD . "\n" . $json, LOCK_EX) === false) {
        out(['error' => 'Kan niet opslaan: map "data" is niet schrijfbaar'], 500);
    }
}

function clean(array $input): array {
    $out = [];
    $seen = [];
    foreach (array_slice($input, 0, 200) as $b) {
        if (!is_array($b)) continue;
        $name = trim(mb_substr(strip_tags((string)($b['name'] ?? '')), 0, 60));
        if ($name === '') continue;
        $id = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($b['id'] ?? ''));
        if ($id === '' || isset($seen[$id])) $id = 'b' . bin2hex(random_bytes(4));
        $seen[$id] = true;
        $row = ['id' => $id, 'name' => $name];
        foreach (FIELDS as $f) {
            $v = is_numeric($b[$f] ?? null) ? (float)$b[$f] : 0.0;
            $v = max(0, min(100000000, round($v, 2)));
            $row[$f] = ($v == floor($v)) ? (int)$v : $v;
        }
        $out[] = $row;
    }
    return $out;
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$body = [];
if ($method === 'POST') {
    $body = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($body)) $body = [];
}

switch ($action) {
    case 'me':
        out(['role' => role()]);

    case 'login':
        if ($method !== 'POST') out(['error' => 'Methode niet toegestaan'], 405);
        $u = (string)($body['user'] ?? '');
        $p = (string)($body['pass'] ?? '');
        $r = null;
        if (hash_equals(strtolower(ADMIN_USER), strtolower($u)) && hash_equals(ADMIN_PASS, $p)) $r = 'admin';
        elseif (hash_equals(strtolower(BELLER_USER), strtolower($u)) && hash_equals(BELLER_PASS, $p)) $r = 'beller';
        if (!$r) { usleep(800000); out(['error' => 'Onjuiste gegevens'], 401); }
        session_regenerate_id(true);
        $_SESSION['role'] = $r;
        out(['role' => $r]);

    case 'logout':
        $_SESSION = [];
        session_destroy();
        $p = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => $p['samesite']]);
        out(['ok' => true]);

    case 'data':
        if (!role()) out(['error' => 'Niet ingelogd'], 401);
        $data = load();
        if (role() !== 'admin') {
            // Uurloon is alleen voor beheerders: totale uren niet meesturen naar bellers
            foreach ($data['bellers'] as &$row) unset($row['urenTotaal']);
            unset($row);
        }
        out($data);

    case 'save':
        if ($method !== 'POST') out(['error' => 'Methode niet toegestaan'], 405);
        if (role() !== 'admin') out(['error' => 'Geen toegang'], role() ? 403 : 401);
        $data = ['updatedAt' => gmdate('c'), 'bellers' => clean((array)($body['bellers'] ?? []))];
        store($data);
        out($data);

    default:
        out(['error' => 'Onbekende actie'], 404);
}
