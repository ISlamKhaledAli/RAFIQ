using System;
using System.IO;
using System.Net;
using System.Text;

namespace RafiqPOS.Services
{
    public class SyncHttpResponse
    {
        public bool IsSuccess { get; set; }
        public int StatusCode { get; set; }
        public string Body { get; set; }
        public string ErrorMessage { get; set; }
    }

    public class SyncHttpClient
    {
        private const int DefaultTimeoutMs = 30000;

        static SyncHttpClient()
        {
            try
            {
                // Enforce TLS 1.2 for Windows 7 SP1 compatibility with Cloudflare Edge
                ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072; // Tls12
                // Reuse TLS connections & eliminate Expect: 100-continue roundtrip delay
                if (ServicePointManager.DefaultConnectionLimit < 12)
                {
                    ServicePointManager.DefaultConnectionLimit = 12;
                }
                ServicePointManager.Expect100Continue = false;
            }
            catch
            {
                // Ignore if OS doesn't support explicit flag override
            }
        }

        public SyncHttpResponse GetJson(string url, string storeId, string apiKey, int timeoutMs = DefaultTimeoutMs)
        {
            return SendRequest("GET", url, null, storeId, apiKey, timeoutMs);
        }

        public SyncHttpResponse PostJson(string url, string jsonBody, string storeId, string apiKey, int timeoutMs = DefaultTimeoutMs)
        {
            return SendRequest("POST", url, jsonBody, storeId, apiKey, timeoutMs);
        }

        private SyncHttpResponse SendRequest(string method, string url, string jsonBody, string storeId, string apiKey, int timeoutMs)
        {
            var result = new SyncHttpResponse();
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                req.Method = method;
                req.Timeout = timeoutMs;
                req.ReadWriteTimeout = timeoutMs;
                req.KeepAlive = true;
                req.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;
                req.Accept = "application/json";
                req.UserAgent = "RafiqPOS-SyncEngine/1.0";

                if (!string.IsNullOrEmpty(storeId))
                {
                    req.Headers["X-Store-Id"] = storeId;
                }
                if (!string.IsNullOrEmpty(apiKey))
                {
                    req.Headers["X-Api-Key"] = apiKey;
                }

                if (method == "POST" || method == "PUT")
                {
                    req.ContentType = "application/json; charset=utf-8";
                    byte[] payloadBytes = Encoding.UTF8.GetBytes(jsonBody ?? "{}");
                    req.ContentLength = payloadBytes.Length;
                    using (Stream reqStream = req.GetRequestStream())
                    {
                        reqStream.Write(payloadBytes, 0, payloadBytes.Length);
                    }
                }

                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                {
                    result.StatusCode = (int)resp.StatusCode;
                    result.IsSuccess = result.StatusCode >= 200 && result.StatusCode < 300;
                    using (Stream respStream = resp.GetResponseStream())
                    {
                        if (respStream != null)
                        {
                            using (StreamReader reader = new StreamReader(respStream, Encoding.UTF8))
                            {
                                result.Body = reader.ReadToEnd();
                            }
                        }
                    }
                }
            }
            catch (WebException webEx)
            {
                result.IsSuccess = false;
                if (webEx.Response != null)
                {
                    try
                    {
                        HttpWebResponse errResp = (HttpWebResponse)webEx.Response;
                        result.StatusCode = (int)errResp.StatusCode;
                        using (Stream errStream = errResp.GetResponseStream())
                        {
                            if (errStream != null)
                            {
                                using (StreamReader reader = new StreamReader(errStream, Encoding.UTF8))
                                {
                                    result.Body = reader.ReadToEnd();
                                }
                            }
                        }
                        result.ErrorMessage = string.Format("HTTP {0}: {1}", result.StatusCode, string.IsNullOrEmpty(result.Body) ? webEx.Message : result.Body);
                    }
                    catch
                    {
                        result.ErrorMessage = webEx.Message;
                    }
                }
                else
                {
                    result.StatusCode = 0;
                    result.ErrorMessage = "تعذر الاتصال بالسيرفر السحابي: " + webEx.Message;
                }
            }
            catch (Exception ex)
            {
                result.IsSuccess = false;
                result.StatusCode = 0;
                result.ErrorMessage = ex.Message;
            }

            return result;
        }
    }
}
