#import <AudioToolbox/AudioToolbox.h>
#import <AudioToolbox/AUCocoaUIView.h>
#import <Cocoa/Cocoa.h>
#import <Foundation/Foundation.h>

#include <ctype.h>

static NSString* FwakFourCC(OSType value) {
  char chars[5] = {
    (char)((value >> 24) & 0xff),
    (char)((value >> 16) & 0xff),
    (char)((value >> 8) & 0xff),
    (char)(value & 0xff),
    0
  };
  for (int index = 0; index < 4; index += 1) {
    if (!isprint((unsigned char)chars[index])) {
      chars[index] = '?';
    }
  }
  return [NSString stringWithUTF8String:chars];
}

static NSArray<NSNumber*>* FwakSearchTypes(void) {
  return @[
    @(kAudioUnitType_Effect),
    @(kAudioUnitType_MusicEffect),
    @(kAudioUnitType_MusicDevice)
  ];
}

static AudioComponent FwakFindComponent(NSString* name, BOOL exactMatch, AudioComponentDescription* foundDescription, NSString** foundName) {
  NSString* needle = name.lowercaseString;
  for (NSNumber* typeNumber in FwakSearchTypes()) {
    AudioComponentDescription search = {0};
    search.componentType = (OSType)typeNumber.unsignedIntValue;
    AudioComponent component = NULL;
    while ((component = AudioComponentFindNext(component, &search))) {
      AudioComponentDescription description = {0};
      AudioComponentGetDescription(component, &description);
      CFStringRef cfName = NULL;
      AudioComponentCopyName(component, &cfName);
      NSString* displayName = CFBridgingRelease(cfName) ?: @"";
      NSString* haystack = displayName.lowercaseString;
      if ([haystack isEqualToString:needle] || (!exactMatch && [haystack containsString:needle])) {
        if (foundDescription) *foundDescription = description;
        if (foundName) *foundName = displayName;
        return component;
      }
    }
  }
  return NULL;
}

static NSView* FwakCreateFallbackView(NSString* message) {
  NSView* view = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 760, 360)];
  NSTextField* label = [[NSTextField alloc] initWithFrame:NSMakeRect(32, 150, 696, 80)];
  label.stringValue = message;
  label.editable = NO;
  label.bezeled = NO;
  label.drawsBackground = NO;
  label.alignment = NSTextAlignmentCenter;
  label.font = [NSFont systemFontOfSize:18 weight:NSFontWeightMedium];
  [view addSubview:label];
  return view;
}

static NSView* FwakCreateAudioUnitView(AudioComponentInstance unit, NSString** status) {
  UInt32 dataSize = 0;
  Boolean writable = false;
  OSStatus propertyStatus = AudioUnitGetPropertyInfo(unit, kAudioUnitProperty_CocoaUI, kAudioUnitScope_Global, 0, &dataSize, &writable);
  if (propertyStatus != noErr || dataSize < sizeof(AudioUnitCocoaViewInfo)) {
    if (status) *status = [NSString stringWithFormat:@"Audio Unit does not publish a Cocoa UI (status %d).", (int)propertyStatus];
    return nil;
  }

  AudioUnitCocoaViewInfo* viewInfo = malloc(dataSize);
  if (!viewInfo) {
    if (status) *status = @"Could not allocate Cocoa UI metadata.";
    return nil;
  }
  propertyStatus = AudioUnitGetProperty(unit, kAudioUnitProperty_CocoaUI, kAudioUnitScope_Global, 0, viewInfo, &dataSize);
  if (propertyStatus != noErr) {
    if (status) *status = [NSString stringWithFormat:@"AudioUnitGetProperty(kAudioUnitProperty_CocoaUI) failed: %d", (int)propertyStatus];
    free(viewInfo);
    return nil;
  }

  NSURL* bundleURL = CFBridgingRelease(CFRetain(viewInfo->mCocoaAUViewBundleLocation));
  NSString* className = CFBridgingRelease(CFRetain(viewInfo->mCocoaAUViewClass[0]));
  free(viewInfo);

  NSBundle* bundle = [NSBundle bundleWithURL:bundleURL];
  if (!bundle || ![bundle load]) {
    if (status) *status = [NSString stringWithFormat:@"Could not load AU view bundle at %@.", bundleURL.path ?: bundleURL.absoluteString];
    return nil;
  }
  Class factoryClass = [bundle classNamed:className];
  if (!factoryClass) {
    if (status) *status = [NSString stringWithFormat:@"AU view factory class %@ was not found.", className];
    return nil;
  }
  id factory = [[factoryClass alloc] init];
  if (![factory conformsToProtocol:@protocol(AUCocoaUIBase)]) {
    if (status) *status = [NSString stringWithFormat:@"AU view factory %@ does not conform to AUCocoaUIBase.", className];
    return nil;
  }
  NSView* view = [(id<AUCocoaUIBase>)factory uiViewForAudioUnit:unit withSize:NSMakeSize(920, 620)];
  if (!view) {
    if (status) *status = [NSString stringWithFormat:@"AU view factory %@ returned nil.", className];
    return nil;
  }
  if (status) *status = [NSString stringWithFormat:@"Loaded Cocoa UI %@ from %@.", className, bundleURL.path ?: bundleURL.absoluteString];
  return view;
}

int main(int argc, char** argv) {
  @autoreleasepool {
    NSString* name = nil;
    BOOL exactMatch = NO;
    double seconds = 0.0;
    for (int index = 1; index < argc; index += 1) {
      NSString* arg = [NSString stringWithUTF8String:argv[index]];
      if ([arg isEqualToString:@"--name"] && index + 1 < argc) {
        name = [NSString stringWithUTF8String:argv[++index]];
      } else if ([arg isEqualToString:@"--exact"]) {
        exactMatch = YES;
      } else if ([arg isEqualToString:@"--seconds"] && index + 1 < argc) {
        seconds = atof(argv[++index]);
      }
    }

    if (!name) {
      fprintf(stderr, "Usage: stage-au-gui-host --name <component name> [--exact] [--seconds N]\n");
      return 1;
    }

    AudioComponentDescription description = {0};
    NSString* componentName = nil;
    AudioComponent component = FwakFindComponent(name, exactMatch, &description, &componentName);
    if (!component) {
      fprintf(stderr, "Audio Unit component not found for name: %s\n", name.UTF8String);
      return 2;
    }

    AudioComponentInstance unit = NULL;
    OSStatus status = AudioComponentInstanceNew(component, &unit);
    if (status != noErr || !unit) {
      fprintf(stderr, "AudioComponentInstanceNew failed: %d\n", (int)status);
      return 3;
    }
    AudioUnitInitialize(unit);

    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];

    NSString* viewStatus = nil;
    NSView* view = FwakCreateAudioUnitView(unit, &viewStatus);
    if (!view) {
      view = FwakCreateFallbackView(viewStatus ?: @"No custom AU view available.");
    }

    NSRect frame = view.frame;
    if (frame.size.width < 320 || frame.size.height < 200) {
      frame.size = NSMakeSize(920, 620);
      view.frame = frame;
    }

    NSString* title = [NSString stringWithFormat:@"%@ [%@/%@/%@]", componentName ?: name, FwakFourCC(description.componentType), FwakFourCC(description.componentSubType), FwakFourCC(description.componentManufacturer)];
    NSWindow* window = [[NSWindow alloc]
      initWithContentRect:frame
      styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable)
      backing:NSBackingStoreBuffered
      defer:NO
    ];
    window.title = title;
    window.contentView = view;
    [window center];
    [window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];

    NSLog(@"FWAK AU GUI stage loaded: %@ -- %@", title, viewStatus ?: @"fallback view");
    if (seconds > 0) {
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(seconds * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [NSApp terminate:nil];
      });
    }
    [NSApp run];

    AudioUnitUninitialize(unit);
    AudioComponentInstanceDispose(unit);
  }
  return 0;
}
