#ifndef FWAK_PLUGIN_ANALYZER_VIEW_H
#define FWAK_PLUGIN_ANALYZER_VIEW_H

#import <AppKit/AppKit.h>

#include "plugin_core.h"

@interface FWAK_ANALYZER_VIEW_CLASS : NSView
{
@private
    FwakPlugin* _plugin;
    NSInteger _activeHandleIndex;
}

- (instancetype)initWithPlugin:(FwakPlugin*)plugin;

@end

#endif
