
Read the Manifests
--Each application / module has 3 possible entry points, each entry point needs to link to at least 1 file.
- Security - 1 file allowed
- Library - each interface is allowed to be its own file, additionally 1 general file allowed
- Application - 1 file allowed
 (This does not prevent import statements)

How to calculate Required Order
-- Check Application, if it has anything required for this particular stage, or even supports this stage.
  -- if it has any required modules create a list of them, in load order.
    -- check each required module, if they have required modules create a list of them in load order
      -- Repeat previous steps until there are no more required modules.  
-- Repeat the process for each module that is not already in the load order.
-- Once we have the tree, load Application first (with its requirements loaded before it), then each other module in load order.


Create / Rebuild the schema

Build the Virtual File System (for imports)

Build the Security Environment
-Security
Load the security files and run them so they build the security structure in Go.
Destroy this Sobek runtime, keeping the security objects. This limits creating the security context to game start.

Build the Global Environment
-Application  -- Game control.
-Server --  Game control and connection to the server, and events from server.
-Automation -- interface to the automation
-Data -- Interface to the data.
-Easel -- Tools and control over easel
    .Users -- list of all users in this game
        .Connected --- list of currently connected users
    .Interfaces -- List of exposed interfaces, interfaces are declared in manifests and must be loaded in library.        

Load every module whose manifest lists a Library entry point.

Load every module whose manifest lists an Application entry point.

Send the following events, in order (listeners register with Server.events.on()):

Load.Start

Load.Initialize - this is to let things know that all code is now loaded.

Load.Data.PreLoad - this is to let things know that they should create their data hooks.  No reading of data.

Load.Data.Ready - Data hooks are created, we can now read data.

Load.Automation.PreLoad - this is to let things know we are about to load the game automation events.

Load.Automation.Ready - Game Automation is loaded

Load.Users.PreLoad - We are about to load users

Load.Users.Ready - Users for this game are loaded.

Load.Automation.Users.PreLoad - We are about to load user automations

Load.Automation.Users.Ready - User automations loaded

Load.Finish

The game is live at this point. Any later events are not loading events.