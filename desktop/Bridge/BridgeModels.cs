using System;
using Newtonsoft.Json;

namespace RafiqPOS.Bridge
{
    public class BridgeRequest
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("action")]
        public string Action { get; set; }

        [JsonProperty("payload")]
        public object Payload { get; set; }
    }

    public class BridgeResponse
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("success")]
        public bool Success { get; set; }

        [JsonProperty("data")]
        public object Data { get; set; }

        [JsonProperty("error")]
        public BridgeError Error { get; set; }

        public static BridgeResponse Ok(string id, object data)
        {
            return new BridgeResponse
            {
                Id = id,
                Success = true,
                Data = data
            };
        }

        public static BridgeResponse Fail(string id, string code, string message, object details = null)
        {
            return new BridgeResponse
            {
                Id = id,
                Success = false,
                Error = new BridgeError { Code = code, Message = message, Details = details }
            };
        }
    }

    public class BridgeError
    {
        [JsonProperty("code")]
        public string Code { get; set; }

        [JsonProperty("message")]
        public string Message { get; set; }

        [JsonProperty("details", NullValueHandling = NullValueHandling.Ignore)]
        public object Details { get; set; }
    }
}
