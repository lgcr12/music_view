#import <Foundation/Foundation.h>

void MRMediaRemoteGetNowPlayingInfo(dispatch_queue_t queue, void (^completion)(CFDictionaryRef information));

id sanitize(id value) {
  if (!value || value == [NSNull null]) return [NSNull null];
  if ([value isKindOfClass:[NSString class]] || [value isKindOfClass:[NSNumber class]]) return value;
  if ([value isKindOfClass:[NSDate class]]) return @([(NSDate *)value timeIntervalSince1970]);
  if ([value isKindOfClass:[NSData class]]) return [(NSData *)value base64EncodedStringWithOptions:0];
  if ([value isKindOfClass:[NSArray class]]) {
    NSMutableArray *array = [NSMutableArray array];
    for (id item in (NSArray *)value) [array addObject:sanitize(item)];
    return array;
  }
  if ([value isKindOfClass:[NSDictionary class]]) {
    NSMutableDictionary *dict = [NSMutableDictionary dictionary];
    for (id key in (NSDictionary *)value) dict[[key description]] = sanitize(((NSDictionary *)value)[key]);
    return dict;
  }
  return [value description];
}

int main(void) {
  @autoreleasepool {
    dispatch_semaphore_t sema = dispatch_semaphore_create(0);
    MRMediaRemoteGetNowPlayingInfo(dispatch_get_global_queue(QOS_CLASS_DEFAULT, 0), ^(CFDictionaryRef information) {
      NSDictionary *info = (__bridge NSDictionary *)information;
      NSData *json = [NSJSONSerialization dataWithJSONObject:sanitize(info ?: @{}) options:0 error:nil];
      if (json) {
        fwrite(json.bytes, 1, json.length, stdout);
      } else {
        printf("{}");
      }
      dispatch_semaphore_signal(sema);
    });
    dispatch_semaphore_wait(sema, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC));
  }
  return 0;
}
