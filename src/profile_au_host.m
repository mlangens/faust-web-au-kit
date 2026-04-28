#import <AudioToolbox/AudioToolbox.h>
#import <AudioUnit/AudioUnit.h>
#import <Foundation/Foundation.h>

#include <ctype.h>

typedef struct {
  UInt32 sampleRate;
  UInt32 channels;
  UInt32 frames;
  float** data;
} FwakAudioData;

typedef struct {
  const FwakAudioData* input;
  UInt32 position;
} FwakRenderContext;

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

static NSString* FwakScopeName(AudioUnitScope scope) {
  switch (scope) {
    case kAudioUnitScope_Global: return @"global";
    case kAudioUnitScope_Input: return @"input";
    case kAudioUnitScope_Output: return @"output";
    default: return @"unknown";
  }
}

static void FwakPrintJson(id object) {
  NSData* data = [NSJSONSerialization dataWithJSONObject:object options:0 error:nil];
  if (!data) {
    fprintf(stderr, "Could not encode JSON output.\n");
    return;
  }
  fwrite(data.bytes, 1, data.length, stdout);
  fputc('\n', stdout);
}

static void FwakFreeAudio(FwakAudioData* audio) {
  if (!audio || !audio->data) {
    return;
  }
  for (UInt32 channel = 0; channel < audio->channels; channel += 1) {
    free(audio->data[channel]);
  }
  free(audio->data);
  audio->data = NULL;
}

static BOOL FwakAllocateAudio(FwakAudioData* audio, UInt32 channels, UInt32 frames) {
  audio->channels = channels;
  audio->frames = frames;
  audio->data = calloc(channels, sizeof(float*));
  if (!audio->data) {
    return NO;
  }
  for (UInt32 channel = 0; channel < channels; channel += 1) {
    audio->data[channel] = calloc(frames, sizeof(float));
    if (!audio->data[channel]) {
      FwakFreeAudio(audio);
      return NO;
    }
  }
  return YES;
}

static UInt16 FwakReadU16(const UInt8* bytes) {
  return (UInt16)bytes[0] | ((UInt16)bytes[1] << 8);
}

static UInt32 FwakReadU32(const UInt8* bytes) {
  return (UInt32)bytes[0] | ((UInt32)bytes[1] << 8) | ((UInt32)bytes[2] << 16) | ((UInt32)bytes[3] << 24);
}

static BOOL FwakReadFloatWav(NSString* path, FwakAudioData* audio, NSString** error) {
  NSData* data = [NSData dataWithContentsOfFile:path];
  if (!data || data.length < 44) {
    if (error) *error = @"Unable to read WAV input.";
    return NO;
  }
  const UInt8* bytes = data.bytes;
  if (memcmp(bytes, "RIFF", 4) != 0 || memcmp(bytes + 8, "WAVE", 4) != 0) {
    if (error) *error = @"Input is not a RIFF/WAVE file.";
    return NO;
  }

  UInt16 audioFormat = 0;
  UInt16 channels = 0;
  UInt32 sampleRate = 0;
  UInt16 bitsPerSample = 0;
  const UInt8* audioBytes = NULL;
  UInt32 audioByteCount = 0;

  NSUInteger offset = 12;
  while (offset + 8 <= data.length) {
    const UInt8* chunk = bytes + offset;
    UInt32 chunkSize = FwakReadU32(chunk + 4);
    NSUInteger chunkData = offset + 8;
    if (chunkData + chunkSize > data.length) {
      break;
    }
    if (memcmp(chunk, "fmt ", 4) == 0 && chunkSize >= 16) {
      audioFormat = FwakReadU16(bytes + chunkData);
      channels = FwakReadU16(bytes + chunkData + 2);
      sampleRate = FwakReadU32(bytes + chunkData + 4);
      bitsPerSample = FwakReadU16(bytes + chunkData + 14);
    } else if (memcmp(chunk, "data", 4) == 0) {
      audioBytes = bytes + chunkData;
      audioByteCount = chunkSize;
    }
    offset = chunkData + chunkSize + (chunkSize % 2);
  }

  if (!channels || !sampleRate || !audioBytes || !audioByteCount) {
    if (error) *error = @"WAV file is missing format or data.";
    return NO;
  }
  UInt32 bytesPerSample = bitsPerSample / 8;
  UInt32 frames = audioByteCount / (channels * bytesPerSample);
  audio->sampleRate = sampleRate;
  if (!FwakAllocateAudio(audio, channels, frames)) {
    if (error) *error = @"Could not allocate audio buffers.";
    return NO;
  }

  for (UInt32 frame = 0; frame < frames; frame += 1) {
    for (UInt32 channel = 0; channel < channels; channel += 1) {
      const UInt8* sampleBytes = audioBytes + (frame * channels + channel) * bytesPerSample;
      float sample = 0.0f;
      if (audioFormat == 3 && bytesPerSample == 4) {
        memcpy(&sample, sampleBytes, sizeof(float));
      } else if (audioFormat == 1 && bytesPerSample == 2) {
        int16_t value = 0;
        memcpy(&value, sampleBytes, sizeof(value));
        sample = (float)value / 32768.0f;
      } else if (audioFormat == 1 && bytesPerSample == 4) {
        int32_t value = 0;
        memcpy(&value, sampleBytes, sizeof(value));
        sample = (float)value / 2147483648.0f;
      } else {
        if (error) *error = @"Only float32, int16, and int32 WAV inputs are supported.";
        FwakFreeAudio(audio);
        return NO;
      }
      audio->data[channel][frame] = sample;
    }
  }
  return YES;
}

static void FwakAppendBytes(NSMutableData* data, const void* bytes, NSUInteger length) {
  [data appendBytes:bytes length:length];
}

static BOOL FwakWriteFloatWav(NSString* path, const FwakAudioData* audio, NSString** error) {
  NSMutableData* data = [NSMutableData data];
  UInt16 audioFormat = 3;
  UInt16 bitsPerSample = 32;
  UInt16 channels = (UInt16)audio->channels;
  UInt16 blockAlign = channels * sizeof(float);
  UInt32 byteRate = audio->sampleRate * blockAlign;
  UInt32 dataBytes = audio->frames * blockAlign;
  UInt32 riffSize = 36 + dataBytes;
  UInt32 fmtSize = 16;

  FwakAppendBytes(data, "RIFF", 4);
  FwakAppendBytes(data, &riffSize, sizeof(riffSize));
  FwakAppendBytes(data, "WAVE", 4);
  FwakAppendBytes(data, "fmt ", 4);
  FwakAppendBytes(data, &fmtSize, sizeof(fmtSize));
  FwakAppendBytes(data, &audioFormat, sizeof(audioFormat));
  FwakAppendBytes(data, &channels, sizeof(channels));
  FwakAppendBytes(data, &audio->sampleRate, sizeof(audio->sampleRate));
  FwakAppendBytes(data, &byteRate, sizeof(byteRate));
  FwakAppendBytes(data, &blockAlign, sizeof(blockAlign));
  FwakAppendBytes(data, &bitsPerSample, sizeof(bitsPerSample));
  FwakAppendBytes(data, "data", 4);
  FwakAppendBytes(data, &dataBytes, sizeof(dataBytes));
  for (UInt32 frame = 0; frame < audio->frames; frame += 1) {
    for (UInt32 channel = 0; channel < audio->channels; channel += 1) {
      float sample = audio->data[channel][frame];
      FwakAppendBytes(data, &sample, sizeof(sample));
    }
  }

  NSString* dir = [path stringByDeletingLastPathComponent];
  [[NSFileManager defaultManager] createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
  if (![data writeToFile:path atomically:YES]) {
    if (error) *error = @"Unable to write output WAV.";
    return NO;
  }
  return YES;
}

static NSArray<NSNumber*>* FwakSearchTypes(void) {
  return @[
    @(kAudioUnitType_Effect),
    @(kAudioUnitType_MusicEffect),
    @(kAudioUnitType_MusicDevice)
  ];
}

static AudioComponent FwakFindComponent(NSString* name, AudioComponentDescription* foundDescription, NSString** foundName) {
  NSString* needle = name.lowercaseString;
  AudioComponent fallback = NULL;
  AudioComponentDescription fallbackDescription = {0};
  NSString* fallbackName = nil;

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
      if ([haystack isEqualToString:needle] || [haystack containsString:needle]) {
        if (foundDescription) *foundDescription = description;
        if (foundName) *foundName = displayName;
        return component;
      }
      NSUInteger prefixLength = MIN((NSUInteger)18, needle.length);
      if (!fallback && prefixLength > 0 && [haystack containsString:[needle substringToIndex:prefixLength]]) {
        fallback = component;
        fallbackDescription = description;
        fallbackName = displayName;
      }
    }
  }

  if (fallback) {
    if (foundDescription) *foundDescription = fallbackDescription;
    if (foundName) *foundName = fallbackName;
  }
  return fallback;
}

static NSMutableArray<NSDictionary*>* FwakCollectParameters(AudioComponentInstance unit) {
  NSMutableArray<NSDictionary*>* parameters = [NSMutableArray array];
  NSArray<NSNumber*>* scopes = @[
    @(kAudioUnitScope_Global),
    @(kAudioUnitScope_Input),
    @(kAudioUnitScope_Output)
  ];
  for (NSNumber* scopeNumber in scopes) {
    AudioUnitScope scope = (AudioUnitScope)scopeNumber.unsignedIntValue;
    UInt32 dataSize = 0;
    Boolean writable = false;
    if (AudioUnitGetPropertyInfo(unit, kAudioUnitProperty_ParameterList, scope, 0, &dataSize, &writable) != noErr || dataSize == 0) {
      continue;
    }
    UInt32 count = dataSize / sizeof(AudioUnitParameterID);
    AudioUnitParameterID* ids = calloc(count, sizeof(AudioUnitParameterID));
    if (!ids) {
      continue;
    }
    if (AudioUnitGetProperty(unit, kAudioUnitProperty_ParameterList, scope, 0, ids, &dataSize) != noErr) {
      free(ids);
      continue;
    }
    for (UInt32 index = 0; index < count; index += 1) {
      AudioUnitParameterInfo info = {0};
      UInt32 infoSize = sizeof(info);
      AudioUnitParameterID parameterId = ids[index];
      if (AudioUnitGetProperty(unit, kAudioUnitProperty_ParameterInfo, scope, parameterId, &info, &infoSize) != noErr) {
        continue;
      }
      NSString* parameterName = info.cfNameString ? (__bridge NSString*)info.cfNameString : [NSString stringWithUTF8String:info.name];
      AudioUnitParameterValue current = info.defaultValue;
      AudioUnitGetParameter(unit, parameterId, scope, 0, &current);
      [parameters addObject:@{
        @"id": @(parameterId),
        @"scope": FwakScopeName(scope),
        @"scopeCode": @(scope),
        @"element": @0,
        @"name": parameterName ?: @"",
        @"min": @(info.minValue),
        @"max": @(info.maxValue),
        @"default": @(info.defaultValue),
        @"current": @(current),
        @"unit": @(info.unit)
      }];
    }
    free(ids);
  }
  return parameters;
}

static NSDictionary* FwakFindParameter(NSArray<NSDictionary*>* parameters, NSString* key) {
  NSString* normalized = key.lowercaseString;
  NSCharacterSet* nonDigits = [[NSCharacterSet decimalDigitCharacterSet] invertedSet];
  BOOL numeric = normalized.length > 0 && [normalized rangeOfCharacterFromSet:nonDigits].location == NSNotFound;
  if (numeric) {
    NSInteger parameterId = normalized.integerValue;
    for (NSDictionary* parameter in parameters) {
      if ([parameter[@"id"] integerValue] == parameterId) {
        return parameter;
      }
    }
  }
  for (NSDictionary* parameter in parameters) {
    if ([[parameter[@"name"] lowercaseString] isEqualToString:normalized]) {
      return parameter;
    }
  }
  for (NSDictionary* parameter in parameters) {
    if ([[parameter[@"name"] lowercaseString] containsString:normalized]) {
      return parameter;
    }
  }
  return nil;
}

static BOOL FwakApplyOverrides(AudioComponentInstance unit, NSArray<NSDictionary*>* overrides, NSString** error) {
  if (overrides.count == 0) {
    return YES;
  }
  NSArray<NSDictionary*>* parameters = FwakCollectParameters(unit);
  for (NSDictionary* override in overrides) {
    NSString* key = override[@"key"];
    NSDictionary* parameter = FwakFindParameter(parameters, key);
    if (!parameter) {
      if (error) *error = [NSString stringWithFormat:@"Parameter override did not match any exposed Audio Unit parameter: %@", key];
      return NO;
    }
    OSStatus status = AudioUnitSetParameter(
      unit,
      (AudioUnitParameterID)[parameter[@"id"] unsignedIntValue],
      (AudioUnitScope)[parameter[@"scopeCode"] unsignedIntValue],
      0,
      [override[@"value"] floatValue],
      0
    );
    if (status != noErr) {
      if (error) *error = [NSString stringWithFormat:@"AudioUnitSetParameter failed for %@: %d", parameter[@"name"], (int)status];
      return NO;
    }
  }
  return YES;
}

static BOOL FwakCreateUnit(NSString* name, AudioComponentInstance* unit, AudioComponentDescription* description, NSString** componentName, NSString** error) {
  AudioComponent component = FwakFindComponent(name, description, componentName);
  if (!component) {
    if (error) *error = [NSString stringWithFormat:@"Audio Unit component not found for name: %@", name];
    return NO;
  }
  OSStatus status = AudioComponentInstanceNew(component, unit);
  if (status != noErr || !*unit) {
    if (error) *error = [NSString stringWithFormat:@"AudioComponentInstanceNew failed: %d", (int)status];
    return NO;
  }
  return YES;
}

static OSStatus FwakInputCallback(
  void* refCon,
  AudioUnitRenderActionFlags* flags,
  const AudioTimeStamp* timeStamp,
  UInt32 busNumber,
  UInt32 frameCount,
  AudioBufferList* ioData
) {
  (void)flags;
  (void)timeStamp;
  (void)busNumber;
  FwakRenderContext* context = (FwakRenderContext*)refCon;
  const FwakAudioData* input = context->input;
  for (UInt32 bufferIndex = 0; bufferIndex < ioData->mNumberBuffers; bufferIndex += 1) {
    float* destination = (float*)ioData->mBuffers[bufferIndex].mData;
    UInt32 channel = MIN(bufferIndex, input->channels - 1);
    for (UInt32 frame = 0; frame < frameCount; frame += 1) {
      UInt32 sourceFrame = context->position + frame;
      destination[frame] = sourceFrame < input->frames ? input->data[channel][sourceFrame] : 0.0f;
    }
  }
  context->position += frameCount;
  return noErr;
}

static int FwakListComponents(void) {
  NSMutableArray<NSDictionary*>* components = [NSMutableArray array];
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
      [components addObject:@{
        @"name": displayName,
        @"type": FwakFourCC(description.componentType),
        @"subtype": FwakFourCC(description.componentSubType),
        @"manufacturer": FwakFourCC(description.componentManufacturer)
      }];
    }
  }
  FwakPrintJson(components);
  return 0;
}

static int FwakPrintParameters(NSString* name, NSArray<NSDictionary*>* overrides) {
  NSString* error = nil;
  AudioComponentDescription description = {0};
  NSString* componentName = nil;
  AudioComponentInstance unit = NULL;
  if (!FwakCreateUnit(name, &unit, &description, &componentName, &error)) {
    fprintf(stderr, "%s\n", error.UTF8String);
    return 3;
  }
  if (!FwakApplyOverrides(unit, overrides, &error)) {
    fprintf(stderr, "%s\n", error.UTF8String);
    AudioComponentInstanceDispose(unit);
    return 4;
  }
  FwakPrintJson(@{
    @"component": componentName ?: name,
    @"type": FwakFourCC(description.componentType),
    @"subtype": FwakFourCC(description.componentSubType),
    @"manufacturer": FwakFourCC(description.componentManufacturer),
    @"parameters": FwakCollectParameters(unit)
  });
  AudioComponentInstanceDispose(unit);
  return 0;
}

static int FwakRender(NSString* name, NSString* inputPath, NSString* outputPath, double tailSeconds, NSArray<NSDictionary*>* overrides) {
  NSString* error = nil;
  FwakAudioData input = {0};
  if (!FwakReadFloatWav(inputPath, &input, &error)) {
    fprintf(stderr, "%s\n", error.UTF8String);
    return 2;
  }

  AudioComponentDescription description = {0};
  NSString* componentName = nil;
  AudioComponentInstance unit = NULL;
  if (!FwakCreateUnit(name, &unit, &description, &componentName, &error)) {
    fprintf(stderr, "%s\n", error.UTF8String);
    FwakFreeAudio(&input);
    return 3;
  }
  if (!FwakApplyOverrides(unit, overrides, &error)) {
    fprintf(stderr, "%s\n", error.UTF8String);
    AudioComponentInstanceDispose(unit);
    FwakFreeAudio(&input);
    return 4;
  }

  UInt32 maxFrames = 512;
  AudioUnitSetProperty(unit, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global, 0, &maxFrames, sizeof(maxFrames));

  AudioStreamBasicDescription stream = {0};
  stream.mSampleRate = input.sampleRate;
  stream.mFormatID = kAudioFormatLinearPCM;
  stream.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked | kAudioFormatFlagIsNonInterleaved | kAudioFormatFlagsNativeEndian;
  stream.mBytesPerPacket = sizeof(float);
  stream.mFramesPerPacket = 1;
  stream.mBytesPerFrame = sizeof(float);
  stream.mChannelsPerFrame = input.channels;
  stream.mBitsPerChannel = 32;
  AudioUnitSetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input, 0, &stream, sizeof(stream));
  AudioUnitSetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 0, &stream, sizeof(stream));

  FwakRenderContext context = { &input, 0 };
  AURenderCallbackStruct callback = { FwakInputCallback, &context };
  OSStatus status = AudioUnitSetProperty(unit, kAudioUnitProperty_SetRenderCallback, kAudioUnitScope_Input, 0, &callback, sizeof(callback));
  if (status != noErr) {
    fprintf(stderr, "AudioUnitSetProperty render callback failed: %d\n", (int)status);
    AudioComponentInstanceDispose(unit);
    FwakFreeAudio(&input);
    return 5;
  }
  status = AudioUnitInitialize(unit);
  if (status != noErr) {
    fprintf(stderr, "AudioUnitInitialize failed: %d\n", (int)status);
    AudioComponentInstanceDispose(unit);
    FwakFreeAudio(&input);
    return 6;
  }
  if (!FwakApplyOverrides(unit, overrides, &error)) {
    fprintf(stderr, "%s\n", error.UTF8String);
    AudioUnitUninitialize(unit);
    AudioComponentInstanceDispose(unit);
    FwakFreeAudio(&input);
    return 6;
  }

  FwakAudioData output = {0};
  output.sampleRate = input.sampleRate;
  UInt32 tailFrames = (UInt32)MAX(0, tailSeconds * input.sampleRate);
  if (!FwakAllocateAudio(&output, input.channels, input.frames + tailFrames)) {
    fprintf(stderr, "Could not allocate output buffers.\n");
    AudioUnitUninitialize(unit);
    AudioComponentInstanceDispose(unit);
    FwakFreeAudio(&input);
    return 7;
  }

  AudioBufferList* outputList = calloc(1, sizeof(AudioBufferList) + sizeof(AudioBuffer) * (output.channels - 1));
  float** blockData = calloc(output.channels, sizeof(float*));
  for (UInt32 channel = 0; channel < output.channels; channel += 1) {
    blockData[channel] = calloc(maxFrames, sizeof(float));
  }
  outputList->mNumberBuffers = output.channels;
  AudioTimeStamp timestamp = {0};
  timestamp.mFlags = kAudioTimeStampSampleTimeValid;

  for (UInt32 frame = 0; frame < output.frames; frame += maxFrames) {
    UInt32 framesThisBlock = MIN(maxFrames, output.frames - frame);
    for (UInt32 channel = 0; channel < output.channels; channel += 1) {
      memset(blockData[channel], 0, sizeof(float) * maxFrames);
      outputList->mBuffers[channel].mNumberChannels = 1;
      outputList->mBuffers[channel].mDataByteSize = framesThisBlock * sizeof(float);
      outputList->mBuffers[channel].mData = blockData[channel];
    }
    timestamp.mSampleTime = frame;
    status = AudioUnitRender(unit, NULL, &timestamp, 0, framesThisBlock, outputList);
    if (status != noErr) {
      fprintf(stderr, "AudioUnitRender failed: %d\n", (int)status);
      for (UInt32 channel = 0; channel < output.channels; channel += 1) free(blockData[channel]);
      free(blockData);
      free(outputList);
      FwakFreeAudio(&output);
      AudioUnitUninitialize(unit);
      AudioComponentInstanceDispose(unit);
      FwakFreeAudio(&input);
      return 8;
    }
    for (UInt32 channel = 0; channel < output.channels; channel += 1) {
      memcpy(output.data[channel] + frame, blockData[channel], framesThisBlock * sizeof(float));
    }
  }

  for (UInt32 channel = 0; channel < output.channels; channel += 1) free(blockData[channel]);
  free(blockData);
  free(outputList);
  AudioUnitUninitialize(unit);
  AudioComponentInstanceDispose(unit);
  FwakFreeAudio(&input);

  if (!FwakWriteFloatWav(outputPath, &output, &error)) {
    fprintf(stderr, "%s\n", error.UTF8String);
    FwakFreeAudio(&output);
    return 9;
  }
  FwakPrintJson(@{
    @"ok": @YES,
    @"component": componentName ?: name,
    @"type": FwakFourCC(description.componentType),
    @"subtype": FwakFourCC(description.componentSubType),
    @"manufacturer": FwakFourCC(description.componentManufacturer),
    @"frames": @(output.frames)
  });
  FwakFreeAudio(&output);
  return 0;
}

static NSDictionary* FwakParseOverride(NSString* raw) {
  NSRange separator = [raw rangeOfString:@"="];
  if (separator.location == NSNotFound) {
    separator = [raw rangeOfString:@":"];
  }
  if (separator.location == NSNotFound || separator.location == 0) {
    return nil;
  }
  NSString* key = [raw substringToIndex:separator.location];
  NSString* value = [raw substringFromIndex:separator.location + separator.length];
  return @{ @"key": key, @"value": @(value.doubleValue) };
}

int main(int argc, char** argv) {
  @autoreleasepool {
    NSString* mode = @"--list";
    NSString* name = nil;
    NSString* input = nil;
    NSString* output = nil;
    double tailSeconds = 2.0;
    NSMutableArray<NSDictionary*>* overrides = [NSMutableArray array];

    for (int index = 1; index < argc; index += 1) {
      NSString* arg = [NSString stringWithUTF8String:argv[index]];
      if ([arg isEqualToString:@"--list"]) {
        mode = @"--list";
      } else if ([arg isEqualToString:@"--render"]) {
        mode = @"--render";
      } else if ([arg isEqualToString:@"--parameters"]) {
        mode = @"--parameters";
      } else if ([arg isEqualToString:@"--name"] && index + 1 < argc) {
        name = [NSString stringWithUTF8String:argv[++index]];
      } else if ([arg isEqualToString:@"--input"] && index + 1 < argc) {
        input = [NSString stringWithUTF8String:argv[++index]];
      } else if ([arg isEqualToString:@"--output"] && index + 1 < argc) {
        output = [NSString stringWithUTF8String:argv[++index]];
      } else if ([arg isEqualToString:@"--tail"] && index + 1 < argc) {
        tailSeconds = atof(argv[++index]);
      } else if ([arg isEqualToString:@"--set"] && index + 1 < argc) {
        NSDictionary* override = FwakParseOverride([NSString stringWithUTF8String:argv[++index]]);
        if (!override) {
          fprintf(stderr, "Invalid parameter override. Use --set <id-or-name>=<value>.\n");
          return 1;
        }
        [overrides addObject:override];
      }
    }

    if ([mode isEqualToString:@"--list"]) {
      return FwakListComponents();
    }
    if ([mode isEqualToString:@"--parameters"]) {
      if (!name) {
        fprintf(stderr, "Usage: profile-au-host --parameters --name <component name> [--set <id-or-name>=<value>]\n");
        return 1;
      }
      return FwakPrintParameters(name, overrides);
    }
    if (!name || !input || !output) {
      fprintf(stderr, "Usage: profile-au-host --render --name <component name> --input <input.wav> --output <output.wav> [--tail seconds] [--set <id-or-name>=<value>]\n");
      return 1;
    }
    return FwakRender(name, input, output, tailSeconds, overrides);
  }
}
