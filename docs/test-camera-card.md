# Camera Card Test Guide

## Testing the Camera Card Implementation

### Prerequisites

1. Ensure the development server is running
2. Have Home Assistant configured with the development panel (localhost:3000)
3. Have at least one camera entity in Home Assistant

### Test Steps

1. **Access the Panel**
   - Navigate to Home Assistant sidebar
   - Click on "Liebe Dev" panel
2. **Enter Edit Mode**
   - Press 'e' or click the edit button
3. **Add a Camera**
   - Click on an empty grid cell
   - In the entity browser, search for "camera"
   - Select a camera entity (e.g., camera.demo_camera)
   - Click to place it on the grid
4. **Exit Edit Mode**
   - Press 'e' again or click the view button
5. **Verify Camera Display**
   - In view mode, the camera should attempt to connect via WebRTC
   - You should see either:
     - A video stream (if WebRTC is properly configured)
     - A "Camera Configuration Required" message with setup instructions
     - A connection error with retry button

### Expected Behavior

#### If WebRTC is Configured:

- Camera shows live video stream
- Video plays automatically
- Stream is muted by default
- Status shows "STREAMING" or "RECORDING"

#### If WebRTC is Not Configured:

- Shows configuration instructions
- Provides link to go2rtc setup guide
- Clear error message about streaming requirements

#### If Camera is Unavailable:

- Shows camera icon in gray
- Status shows "UNAVAILABLE"
- Card has reduced opacity

### Common Issues

1. **"Camera Configuration Required" Message**
   - This means the camera needs WebRTC/go2rtc setup
   - Follow the on-screen instructions to configure go2rtc
2. **"Failed to establish WebRTC connection"**
   - Check browser console for detailed errors
   - Verify camera entity supports streaming (SUPPORT_STREAM feature)
   - Ensure go2rtc is running and accessible

3. **Camera Not Appearing in Entity Browser**
   - Verify camera entities exist in Home Assistant
   - Check that camera domain is not filtered out
   - Refresh the page to reload entities

### WebRTC Configuration (if needed)

1. Install go2rtc addon in Home Assistant
2. Configure your camera's RTSP stream in go2rtc
3. Enable WebRTC for the camera
4. Restart Home Assistant

For detailed setup: https://github.com/AlexxIT/go2rtc#quick-start
