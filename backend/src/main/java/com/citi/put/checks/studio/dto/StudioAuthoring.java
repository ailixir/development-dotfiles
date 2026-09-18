package com.citi.put.checks.studio.dto;

/** A legacy or context-aware Studio authoring source. */
public sealed interface StudioAuthoring permits LegacyAuthoringRequest, AuthoringV2Request {}
