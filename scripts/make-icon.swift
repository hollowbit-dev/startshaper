// Draws Startshaper's app icon (1024x1024 PNG): warm orange tile with a speed gauge.
import AppKit
let size: CGFloat = 1024
let img = NSImage(size: NSSize(width: size, height: size))
img.lockFocus()
let ctx = NSGraphicsContext.current!.cgContext
let inset: CGFloat = 100
let rect = CGRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2)
let tile = CGPath(roundedRect: rect, cornerWidth: 190, cornerHeight: 190, transform: nil)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -14), blur: 40, color: NSColor(white: 0, alpha: 0.35).cgColor)
ctx.addPath(tile); ctx.setFillColor(NSColor.black.cgColor); ctx.fillPath()
ctx.restoreGState()
ctx.saveGState()
ctx.addPath(tile); ctx.clip()
let cs = CGColorSpaceCreateDeviceRGB()
let g = CGGradient(colorsSpace: cs, colors: [
  NSColor(red: 1.0, green: 0.74, blue: 0.40, alpha: 1).cgColor,
  NSColor(red: 1.0, green: 0.54, blue: 0.28, alpha: 1).cgColor,
  NSColor(red: 0.93, green: 0.30, blue: 0.36, alpha: 1).cgColor] as CFArray, locations: [0, 0.5, 1])!
ctx.drawLinearGradient(g, start: CGPoint(x: 0, y: size - inset), end: CGPoint(x: 0, y: inset), options: [])
let glow = CGGradient(colorsSpace: cs, colors: [NSColor(white: 1, alpha: 0.28).cgColor, NSColor(white: 1, alpha: 0).cgColor] as CFArray, locations: [0, 1])!
ctx.drawRadialGradient(glow, startCenter: CGPoint(x: size * 0.42, y: size * 0.62), startRadius: 0, endCenter: CGPoint(x: size * 0.42, y: size * 0.62), endRadius: 420, options: [])
ctx.restoreGState()

// The gauge: a dark arc track, a white arc for the "fast" part, a needle pointing high, a hub.
let cx: CGFloat = 512, cy: CGFloat = 430, r: CGFloat = 250, lw: CGFloat = 74
ctx.setLineCap(.round)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 30, color: NSColor(red: 0.45, green: 0.1, blue: 0.05, alpha: 0.35).cgColor)
ctx.setLineWidth(lw)
ctx.setStrokeColor(NSColor(red: 0.35, green: 0.08, blue: 0.06, alpha: 0.38).cgColor)
ctx.addArc(center: CGPoint(x: cx, y: cy), radius: r, startAngle: .pi * 0.95, endAngle: .pi * 0.05, clockwise: true)
ctx.strokePath()
ctx.restoreGState()
ctx.setLineWidth(lw)
ctx.setStrokeColor(NSColor.white.cgColor)
ctx.addArc(center: CGPoint(x: cx, y: cy), radius: r, startAngle: .pi * 0.95, endAngle: .pi * 0.28, clockwise: true)
ctx.strokePath()
// needle
let ang: CGFloat = .pi * 0.26
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -8), blur: 24, color: NSColor(red: 0.4, green: 0.08, blue: 0.05, alpha: 0.45).cgColor)
ctx.setLineWidth(46)
ctx.setStrokeColor(NSColor(red: 0.16, green: 0.09, blue: 0.13, alpha: 1).cgColor)
ctx.move(to: CGPoint(x: cx, y: cy))
ctx.addLine(to: CGPoint(x: cx + cos(ang) * (r - 40), y: cy + sin(ang) * (r - 40)))
ctx.strokePath()
ctx.restoreGState()
ctx.setFillColor(NSColor(red: 0.16, green: 0.09, blue: 0.13, alpha: 1).cgColor)
ctx.fillEllipse(in: CGRect(x: cx - 62, y: cy - 62, width: 124, height: 124))
ctx.setFillColor(NSColor.white.cgColor)
ctx.fillEllipse(in: CGRect(x: cx - 24, y: cy - 24, width: 48, height: 48))
img.unlockFocus()
let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
