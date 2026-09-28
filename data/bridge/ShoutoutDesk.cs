using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private static readonly object Gate = new object();
    private const string Secret = "__BRIDGE_SECRET__";
    private const string LedgerName = "ShoutoutDeskOBS.Ledger.v1";

    public bool Execute()
    {
        string key, request, op, operation, login, account;
        CPH.TryGetArg("sd_key", out key);
        CPH.TryGetArg("sd_request", out request);
        CPH.TryGetArg("sd_op", out op);
        CPH.TryGetArg("sd_operation", out operation);
        CPH.TryGetArg("sd_login", out login);
        CPH.TryGetArg("sd_account", out account);
        if (key != Secret || !IsGuid(request)) return false;
        JObject reply = new JObject { ["status"] = "failed", ["detail"] = "Bridge request failed" };
        bool reserved = false;
        try
        {
            lock (Gate)
            {
                var broadcaster = CPH.TwitchGetBroadcaster();
                if (broadcaster == null) throw new InvalidOperationException();
                string broadcasterId = broadcaster.UserId;
                if (op == "probe")
                {
                    var ledger = LoadLedger();
                    reply = IsGuid(operation) && ledger[operation] is JObject ? (JObject)ledger[operation].DeepClone() : new JObject { ["status"] = "unknown" };
                }
                else using (var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }))
                {
                    client.Timeout = TimeSpan.FromSeconds(8);
                    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", CPH.TwitchOAuthToken);
                    client.DefaultRequestHeaders.Add("Client-Id", CPH.TwitchClientId);
                    var streams = Get(client, "streams?user_id=" + Uri.EscapeDataString(broadcasterId));
                    bool live = ((JArray)streams["data"]).Count > 0;
                    if (op == "status")
                        reply = new JObject { ["status"] = "ok", ["live"] = live, ["account"] = broadcasterId, ["channel"] = broadcaster.UserLogin };
                    else if (op == "send" && IsGuid(operation) && account == broadcasterId && Regex.IsMatch(login ?? "", "^[a-z0-9_]{1,25}$"))
                    {
                        var ledger = LoadLedger();
                        if (ledger[operation] is JObject && (string)ledger[operation]["status"] != "rate_limited") reply = (JObject)ledger[operation].DeepClone();
                        else if (!live) reply = new JObject { ["status"] = "offline" };
                        else
                        {
                            var users = (JArray)Get(client, "users?login=" + Uri.EscapeDataString(login))["data"];
                            if (users.Count == 0 || (string)users[0]["id"] == broadcasterId)
                                reply = new JObject { ["status"] = "failed", ["detail"] = "Канал не найден или выбран собственный канал" };
                            else
                            {
                                // Reserve before touching Twitch: a crash must not create a second shoutout.
                                ledger[operation] = new JObject { ["status"] = "unknown", ["createdAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() };
                                SaveLedger(ledger);
                                reserved = true;
                                string url = "https://api.twitch.tv/helix/chat/shoutouts?from_broadcaster_id=" + broadcasterId
                                    + "&moderator_id=" + broadcasterId + "&to_broadcaster_id=" + (string)users[0]["id"];
                                try
                                {
                                    using (var response = client.PostAsync(url, null).GetAwaiter().GetResult())
                                    {
                                        int code = (int)response.StatusCode;
                                        reply = new JObject { ["status"] = code == 204 ? "sent" : code == 429 ? "rate_limited" : code >= 500 ? "unknown" : "failed", ["http"] = code };
                                        if (code == 204) reply["sentAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                                        else reply["detail"] = code == 401 || code == 403 ? "Проверьте авторизацию Twitch и право на шотауты в Streamer.bot" : "Twitch отклонил запрос: HTTP " + code;
                                    }
                                }
                                catch { reply = new JObject { ["status"] = "unknown" }; }
                            }
                        }
                        reply["createdAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                        ledger[operation] = reply.DeepClone();
                        SaveLedger(ledger);
                    }
                }
            }
        }
        catch { reply = new JObject { ["status"] = reserved ? "unknown" : "failed", ["detail"] = "Не удалось проверить Twitch. Проверьте подключение аккаунта в Streamer.bot." }; }
        reply["app"] = "ShoutoutDesk";
        reply["version"] = 1;
        reply["requestId"] = request;
        CPH.WebsocketBroadcastJson(reply.ToString(Newtonsoft.Json.Formatting.None));
        return true;
    }
    private bool IsGuid(string value) { Guid id; return Guid.TryParse(value, out id); }
    private JObject Get(HttpClient client, string path)
    {
        using (var response = client.GetAsync("https://api.twitch.tv/helix/" + path).GetAwaiter().GetResult())
        {
            response.EnsureSuccessStatusCode();
            return JObject.Parse(response.Content.ReadAsStringAsync().GetAwaiter().GetResult());
        }
    }
    private JObject LoadLedger()
    {
        string saved = CPH.GetGlobalVar<string>(LedgerName, true);
        return string.IsNullOrEmpty(saved) ? new JObject() : JObject.Parse(saved);
    }
    private void SaveLedger(JObject ledger)
    {
        long cutoff = DateTimeOffset.UtcNow.AddDays(-30).ToUnixTimeMilliseconds();
        var expired = new System.Collections.Generic.List<string>();
        foreach (var item in ledger.Properties())
            if ((long?)item.Value["createdAt"] < cutoff) expired.Add(item.Name);
        foreach (string name in expired) ledger.Remove(name);
        CPH.SetGlobalVar(LedgerName, ledger.ToString(Newtonsoft.Json.Formatting.None), true);
    }
}
