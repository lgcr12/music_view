using System;
using System.Text;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Media.Control;

public static class Program
{
    public static int Main()
    {
        try
        {
            var manager = GlobalSystemMediaTransportControlsSessionManager.RequestAsync()
                .AsTask().GetAwaiter().GetResult();
            if (manager == null)
            {
                Console.WriteLine("{\"found\":false,\"message\":\"No GSMTC manager.\"}");
                return 0;
            }

            var session = manager.GetCurrentSession();
            if (session == null)
            {
                Console.WriteLine("{\"found\":false,\"message\":\"No active media session.\"}");
                return 0;
            }

            var info = session.TryGetMediaPropertiesAsync().AsTask().GetAwaiter().GetResult();
            var timeline = session.GetTimelineProperties();
            var playback = session.GetPlaybackInfo();

            var title = info != null ? info.Title ?? string.Empty : string.Empty;
            var artist = info != null ? info.Artist ?? string.Empty : string.Empty;
            var sourceApp = JsonEscape(session.SourceAppUserModelId ?? string.Empty);
            var status = playback != null ? playback.PlaybackStatus.ToString() : string.Empty;
            var position = timeline != null ? timeline.Position.TotalSeconds : 0;
            var duration = timeline != null ? timeline.EndTime.TotalSeconds : 0;

            Console.WriteLine(
                "{\"found\":true," +
                "\"titleBase64\":\"" + Convert.ToBase64String(Encoding.UTF8.GetBytes(title)) + "\"," +
                "\"artistBase64\":\"" + Convert.ToBase64String(Encoding.UTF8.GetBytes(artist)) + "\"," +
                "\"sourceApp\":\"" + sourceApp + "\"," +
                "\"playbackStatus\":\"" + JsonEscape(status) + "\"," +
                "\"elapsed\":" + position.ToString(System.Globalization.CultureInfo.InvariantCulture) + "," +
                "\"duration\":" + duration.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                "}");
            return 0;
        }
        catch (Exception ex)
        {
            Console.WriteLine("{\"found\":false,\"message\":\"" + JsonEscape(ex.GetType().Name + ": " + ex.Message) + "\"}");
            return 0;
        }
    }

    private static string JsonEscape(string value)
    {
        return value
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\r", "\\r")
            .Replace("\n", "\\n");
    }
}
