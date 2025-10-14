from novacore import login, login_silent, login_noexit
import sys

# Call LicenseCheck normally (config file at config/config.json)
try:
    login()
except Exception as e:
    print("Something went wrong, Here's a preview for developers:"+"\n"+e)
    sys.exit(1)

# Call LicenseCheck silently so user doesn't know it's called unless Mismatches found (config file at config/config.json)
try:
    login_silent()
except Exception as e:
    print("Something went wrong, Here's a preview for developers:"+"\n"+e)
    sys.exit(1)

# Call LicenseCheck with no exit so even if any mismatches are found user does/can see logs but program is not exitted (config file at config/config.json)
try:
    login_noexit()
except Exception as e:
    print("Something went wrong, Here's a preview for developers:"+"\n"+e)
    sys.exit(1)





# If you want to get license info from a json file not located at config/config.json but rather located at "path" then use
login(path)
login_noexit(path)
login_silent(path)


# It will exit (not the noexit one) if mismatches found and will continue running normally if not