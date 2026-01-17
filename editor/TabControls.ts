// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

export enum TabSettingType {
	ChannelSettings = 0,
	PatternControls = 1
}

export type TabControl = {
	icon: string,
	type: TabSettingType
}

export const TabControls: { [key: number]: TabControl } = {
	[TabSettingType.ChannelSettings]: { type: TabSettingType.ChannelSettings, icon: '🎺︎' },
	[TabSettingType.PatternControls]: { type: TabSettingType.PatternControls, icon: '🎼' }
}